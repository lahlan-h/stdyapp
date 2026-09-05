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
 * The same idea for likes, versioned independently. A change to the like
 * response shape must not orphan every cached comment, and vice versa.
 */
const LIKE_EPOCH = "l1";

/**
 * And again for posts. Three independent epochs means changing the post
 * response shape orphans no comment or like payload, and vice versa.
 */
const POST_EPOCH = "p1";

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
 * The post's OWN content scope — not to be confused with postVersionKey above,
 * which despite its name is the COMMENT scope on a post (`v:post:<id>`) and is
 * bumped by comment writes.
 *
 * The literal segment is what keeps them apart: `self` and `author` are never
 * uuids, so `v:post:self:<uuid>` can never alias `v:post:<uuid>`. Renaming
 * postVersionKey to say what it means would be the better fix; it is left alone
 * here only because it is load-bearing in two other modules.
 *
 * @param {string} postId
 */
export const postContentVersionKey = (postId) =>
  `${VERSION_PREFIX}post:self:${postId}`;

/** @param {string} userId */
export const postAuthorVersionKey = (userId) =>
  `${VERSION_PREFIX}post:author:${userId}`;

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
 * COHERENCE, and the reason the TTLs in config/cache.js are short rather than
 * generous: these payloads embed rows no comment counter tracks. The thread and
 * single-comment bodies carry the author's username and avatarUrl; the per-user
 * lists carry a whole Post row.
 *
 * The POST half of that hole is now CLOSED: invalidatePostFanout in
 * post.service.js bumps userVersionKey for everyone who commented on a post
 * whenever that post is edited or deleted, so an edited caption no longer
 * lingers in a cached comment list.
 *
 * The USER half remains open. Changing an avatar or username still leaves these
 * responses wrong until they expire, because no comment was written and nothing
 * bumped. Closing it means user.service.js bumping the same counters on its own
 * writes — the same follow-up, one domain smaller.
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
 * Like key builders.
 *
 * Likes get their OWN version counters rather than reusing postVersionKey and
 * userVersionKey above, and that separation is a performance decision worth
 * stating: a like is the highest-frequency write in the app. Sharing v:post:*
 * would mean every heart tap flushed that post's whole comment thread cache —
 * gutting the comment hit rate to invalidate data no like can affect. Nothing in
 * a comment payload depends on likes, and nothing in a like payload depends on
 * comments, so the two namespaces never need to agree.
 *
 * SAME COHERENCE POSITION as the comment keys. These payloads embed rows no like
 * counter tracks: the liked-by list carries the liker's username and avatarUrl,
 * and the per-user list carries a whole Post row.
 *
 * The POST half is CLOSED the same way — invalidatePostFanout bumps
 * likeUserVersionKey for everyone who liked a post when that post changes. The
 * USER half (avatar, username) is still open and still bounded only by the short
 * TTLs in config/cache.js.
 */

/** @param {string} postId */
export const likePostVersionKey = (postId) => `${VERSION_PREFIX}like:post:${postId}`;

/** @param {string} userId */
export const likeUserVersionKey = (userId) => `${VERSION_PREFIX}like:user:${userId}`;

// Includes the viewer: the summary carries likedByMe, which differs per caller.
// It needs no user version, though — likedByMe can only change when THIS viewer
// likes THIS post, and every such event bumps the post counter already.
/** @param {string} postId @param {string} viewerId @param {number} version */
export const likeSummaryKey = (postId, viewerId, version) =>
  `${LIKE_EPOCH}:like:count:${postId}:${viewerId}:p${version}`;

/** @param {string} postId @param {number} version */
export const likedByKey = (postId, version) =>
  `${LIKE_EPOCH}:like:post:${postId}:p${version}`;

// Shared by GET / (listMine) and GET /user/:userId, exactly as userListKey is
// for comments. Both resolve to findLikesByUser(id) and return byte-identical
// data — listMyLikes merely skips the existence check — so separate keys would
// cache the same array twice and halve the hit rate. If those two response
// shapes ever diverge, they must stop sharing this key.
/** @param {string} userId @param {number} version */
export const likeUserListKey = (userId, version) =>
  `${LIKE_EPOCH}:like:byuser:${userId}:u${version}`;

/**
 * Post key builders.
 *
 * ⚠ THE VIEWER IS IN postKey, AND THAT IS A SECURITY REQUIREMENT rather than a
 * cache-shaping choice.
 *
 * Every other cached read in this file is open to any authenticated caller, so
 * its key can safely omit the viewer. GET /api/posts/:id is not: it routes
 * through getOwnedPostOrThrow and 403s for anyone but the author. Because
 * cache() runs BEFORE the controller, a viewer-less key would store the
 * author's 200 and then hand it to the next caller as a HIT — serving someone
 * else's post and never reaching the ownership check at all. Caching would
 * become an authorization bypass.
 *
 * The hit rate costs nothing: only one person can ever get a 200 from that
 * route, so the per-viewer key has exactly one occupant.
 *
 * These payloads are bare Post rows with no embedded username, avatarUrl or
 * joined data, so they have none of the coherence hole described above — every
 * field in them is covered by a counter that post.service.js bumps.
 */

/** @param {string} postId @param {string} viewerId @param {number} version */
export const postKey = (postId, viewerId, version) =>
  `${POST_EPOCH}:post:one:${postId}:${viewerId}:p${version}`;

// Shared by GET / (listMine) and GET /user/:userId, exactly as userListKey and
// likeUserListKey are. Both resolve to findPostsByUser(id) and return
// byte-identical data — listMyPosts merely skips the existence check — so
// separate keys would cache the same array twice and halve the hit rate. If
// those two response shapes ever diverge, they must stop sharing this key.
/** @param {string} userId @param {number} version */
export const postUserListKey = (userId, version) =>
  `${POST_EPOCH}:post:byuser:${userId}:u${version}`;

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
