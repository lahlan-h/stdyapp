import { getRedis, createLogger } from "@stdyapp/core";

/**
 * The fail-open boundary between this API and Redis.
 *
 * EVERY Redis call in apps/api goes through this module, and that is the point
 * of it existing: packages/core/src/redis.js configures the client with
 * enableOfflineQueue:false, maxRetriesPerRequest:1 and commandTimeout:1000, so
 * every command REJECTS while Redis is down instead of buffering. Express 4
 * does not catch rejections from async middleware, so an uncaught one does not
 * produce a 500 — it HANGS the request until the client gives up.
 *
 * Concentrating the error handling here means that discipline is enforced once
 * rather than re-derived correctly at a dozen call sites. Nothing exported from
 * this file ever throws: a failure is reported as a miss, and the caller falls
 * through to Postgres.
 *
 * Cache state is therefore NEVER load-bearing for correctness of the API. Redis
 * being empty, stale, corrupt or entirely absent must only ever cost latency.
 */

const log = createLogger("cache");

// Version counters: bumping one orphans every key stamped with the old value.
const VERSION_PREFIX = "v:";

/**
 * Payload keys carry a schema epoch. Bump it when a cached response SHAPE
 * changes and every key from the old shape is orphaned at once — far cheaper
 * and safer than trying to hunt down and purge the old ones.
 */
const EPOCH = "c1";

/**
 * Version counters outlive the payloads beneath them by a wide margin, and that
 * gap is deliberate.
 *
 * A counter that vanishes resets to 0, which would RESURRECT any payload still
 * cached under version 0 — serving data that was invalidated. Payload TTLs are
 * seconds to minutes (config/cache.js), so seven days guarantees the payloads
 * are long gone before their counter can disappear.
 *
 * Persisting them forever looks safer but is not: under an allkeys-lru
 * maxmemory-policy Redis may evict a counter at any moment. docker-compose.yml
 * sets no maxmemory today, so eviction is off — this guards the day it is not.
 */
const VERSION_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * One pipeline is one round trip, so a huge one is a single command that blocks
 * the Redis event loop for as long as it takes to run — and must finish inside
 * the client's 1s commandTimeout. 500 keys is small enough to stay
 * imperceptible and large enough that even a heavy account cleanup is a handful
 * of round trips rather than thousands.
 */
const CHUNK_SIZE = 500;

// Not an error, but the signal that one account is pathological enough to
// explain a slow request.
const LARGE_INVALIDATION = 20000;

/**
 * Mirrors the down-transition logging in packages/core/src/redis.js: a Redis
 * outage should produce two log lines — one going down, one coming back — not
 * one per request for the duration of the outage.
 */
let isDegraded = false;

const noteFailure = (operation, err) => {
  if (isDegraded) return;
  isDegraded = true;
  log.warn(`degraded, falling through to the database: ${operation} - ${err?.message}`);
};

const noteSuccess = () => {
  if (!isDegraded) return;
  isDegraded = false;
  log.info("recovered, serving from cache again");
};

/** @param {string} postId */
export const postVersionKey = (postId) => `${VERSION_PREFIX}post:${postId}`;

/** @param {string} userId */
export const userVersionKey = (userId) => `${VERSION_PREFIX}user:${userId}`;

/** @param {string} commentId */
export const commentVersionKey = (commentId) => `${VERSION_PREFIX}comment:${commentId}`;

/**
 * Payload key builders.
 *
 * Centralised here rather than inlined at the two ends because a cache key is a
 * CONTRACT between the middleware that writes it and the service that
 * invalidates it. A format that drifted between those two would not fail
 * loudly — it would quietly stop invalidating.
 *
 * Every key is stamped with the version(s) it was built from, so invalidation
 * is an INCR rather than a delete. That is not merely an optimisation over
 * SCAN: it is also race-free in a way deletion is not. A reader that queries
 * the database, then has its result invalidated by a concurrent writer, writes
 * its now-stale body under the OLD version — a key nothing will ever compose
 * again. With a delete, that same reader would write stale data under the live
 * key and pin it there for the whole TTL.
 *
 * KNOWN COHERENCE HOLE, and the reason the TTLs in config/cache.js are short
 * rather than generous: these payloads embed rows no comment counter tracks.
 * The thread and single-comment bodies carry the author's username and
 * avatarUrl; the per-user lists carry a whole Post row. Editing a post caption
 * or changing an avatar leaves those cached responses wrong until they expire,
 * because no comment was written and nothing bumped. Closing it means having
 * post.service.js and user.service.js bump these same counters on their own
 * writes — a natural follow-up, deliberately out of scope here.
 */

/** @param {string} postId @param {number} version */
export const threadKey = (postId, version) => `${EPOCH}:cmt:post:${postId}:p${version}`;

// Includes the viewer: the summary carries commentedByMe, which differs per
// caller. It needs no user version, though — commentedByMe can only change when
// this viewer comments on this post, and every such event bumps the POST
// version already.
/** @param {string} postId @param {string} viewerId @param {number} version */
export const summaryKey = (postId, viewerId, version) =>
  `${EPOCH}:cmt:count:${postId}:${viewerId}:p${version}`;

// Stamped with a per-comment counter rather than the post/user pair, because at
// middleware time the URL carries only the comment id — its postId and author
// are unknown until something reads the row, which is the very thing the cache
// exists to avoid.
/** @param {string} commentId @param {number} version */
export const commentKey = (commentId, version) =>
  `${EPOCH}:cmt:one:${commentId}:c${version}`;

// Shared by GET / (listMine) and GET /user/:userId. Both resolve to
// findCommentsByUser(id) and return byte-identical data — listMyComments merely
// skips the existence check — so separate keys would cache the same array twice
// and halve the hit rate. If those two response shapes ever diverge, they must
// stop sharing this key.
/** @param {string} userId @param {number} version */
export const userListKey = (userId, version) =>
  `${EPOCH}:cmt:byuser:${userId}:u${version}`;

/**
 * Reads version counters, in the order asked for.
 *
 * A counter that has never been bumped does not exist and reads as 0 — without
 * that, a cold Redis would compose keys containing "undefined".
 *
 * Returns NULL, not zeros, when Redis is unreachable. The distinction matters:
 * zeros would be a valid-looking answer and the caller would go on to spend two
 * further doomed round trips. Fully down, those reject instantly — but a WEDGED
 * Redis that accepts connections and stops answering burns the full 1s
 * commandTimeout on each, so "fail open" would quietly become "fail slow",
 * which is the failure mode that actually takes an API down.
 *
 * @param {string[]} keys
 * @returns {Promise<number[] | null>} versions aligned with the input, or null
 */
export const readVersions = async (keys) => {
  // MGET with no arguments is an error, and an empty list is legitimate.
  if (keys.length === 0) return [];

  try {
    const values = await getRedis().mget(keys);
    noteSuccess();
    return values.map((value) => Number(value) || 0);
  } catch (err) {
    noteFailure("mget versions", err);
    return null;
  }
};

/**
 * Reads and parses one cached payload.
 *
 * A JSON.parse failure is reported as a MISS, not an error. A truncated or
 * hand-edited value is not worth a 500 when re-reading Postgres is right there,
 * and this is the difference between one bad key degrading one request and it
 * breaking a route until someone flushes Redis by hand.
 *
 * @param {string} key
 * @returns {Promise<unknown | null>} the payload, or null on a miss
 */
export const readCached = async (key) => {
  try {
    const raw = await getRedis().get(key);
    noteSuccess();
    if (raw === null) return null;

    try {
      return JSON.parse(raw);
    } catch {
      log.warn(`discarding unparseable value at ${key}`);
      return null;
    }
  } catch (err) {
    noteFailure(`get ${key}`, err);
    return null;
  }
};

/**
 * Stores one payload under a TTL.
 *
 * Called fire-and-forget from the response path, so it must swallow
 * everything: the response it belongs to has ALREADY been computed and is on
 * its way to the client, and failing to memoise it is not a reason to break it.
 * The catch is mandatory rather than defensive — an unhandled rejection
 * terminates the process on modern Node.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSec
 * @returns {Promise<void>}
 */
export const writeCached = async (key, value, ttlSec) => {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSec);
    noteSuccess();
  } catch (err) {
    noteFailure(`set ${key}`, err);
  }
};

/**
 * Invalidates by INCREMENTING version counters.
 *
 * Nothing is deleted. Readers stamp the current version into their cache key,
 * so a bump silently orphans every key built from the previous one and the very
 * next read composes a different key and misses. That is what makes this O(1)
 * per scope instead of the O(N) SCAN a wildcard delete would need.
 *
 * INCR on a missing key creates it at 1, so a counter needs no initialisation.
 *
 * MUST be called AFTER the database write has resolved, never before or
 * concurrently. Bumping first lets a reader observe the new version, query the
 * not-yet-committed row, and cache the OLD body under the NEW key — where it
 * would stay for the full TTL. Bumping last can only ever orphan a key.
 *
 * @param {string[]} keys - version keys, from the version-key builders above
 */
export const bumpVersions = async (keys) => {
  // Duplicates are free to drop and common: a bulk delete names the same post
  // once per comment left on it.
  const unique = [...new Set(keys)];
  if (unique.length === 0) return;

  if (unique.length >= LARGE_INVALIDATION) {
    log.warn(`unusually large invalidation: ${unique.length} counters`);
  }

  try {
    const redis = getRedis();

    for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
      const pipeline = redis.pipeline();

      for (const key of unique.slice(index, index + CHUNK_SIZE)) {
        pipeline.incr(key);
        pipeline.expire(key, VERSION_TTL_SEC);
      }

      const results = await pipeline.exec();

      // A pipeline RESOLVES even when every command in it failed: ioredis
      // catches each command's rejection and stores it as an [error, null]
      // tuple (see built/Pipeline.js). A try/catch alone would therefore report
      // a total outage as success — and a silently-failed invalidation is the
      // worst bug available here, because it serves stale data with no log line.
      const failure = results?.find(([err]) => err);
      if (failure) throw failure[0];
    }

    noteSuccess();
  } catch (err) {
    // Invalidation is lost, so entries stamped with the old version stay
    // readable until their TTL lapses. That bounded staleness is the price of
    // the API staying up, and is why every TTL in config/cache.js is short.
    noteFailure(`incr ${unique.length} versions`, err);
  }
};
