import { readVersions, readCached, writeCached } from "../utils/cache.js";

/**
 * Read-through response caching, backed by Redis.
 *
 * A factory returning a request handler, the shape validate.js established for
 * parameterised middleware. It caches the RESPONSE BODY rather than the rows
 * behind it, so a hit skips the controller, the service and the database in one
 * step and costs no re-serialisation.
 *
 * Invalidation is NOT here. It lives in comment.service.js, next to the writes,
 * because that is the layer that knows which post and which author a change
 * belongs to. This module only reads the version counters that invalidation
 * bumps — see utils/cache.js for why that split is what avoids a SCAN.
 *
 * MUST be mounted after requireAuth for any route whose key includes the
 * viewer, and after the rate limiter, so that a cache hit still counts against
 * the caller's budget. Cached reads being free would exempt precisely the
 * traffic a limiter exists to bound.
 */

/**
 * @param {object} options
 * @param {number} options.ttlSec - expiry, a backstop; versions do the real work
 * @param {(req: import("express").Request) => string[]} options.versionKeys
 *   the version counters this route's key is stamped with, in order. Return []
 *   for a route invalidated by exact deletion instead.
 * @param {(req: import("express").Request, versions: number[]) => string} options.buildKey
 * @returns {import("express").RequestHandler}
 */
export const cache = ({ ttlSec, versionKeys, buildKey }) => async (req, res, next) => {
  let key;

  try {
    const versions = await readVersions(versionKeys(req));

    // null, as distinct from zeros, means Redis is unreachable — so skip the
    // GET that is now guaranteed to fail too. Fully down that saves little,
    // since enableOfflineQueue:false rejects instantly; against a WEDGED Redis
    // that accepts connections and stops answering it halves the delay, because
    // each doomed command otherwise burns the full 1s commandTimeout.
    if (versions === null) return next();

    key = buildKey(req, versions);

    const hit = await readCached(key);
    if (hit !== null) {
      res.locals.cache = "HIT";
      res.set("X-Cache", "HIT");
      // Returns BEFORE res.json is patched below, so a response served from the
      // cache is never written back to it.
      return res.status(200).json(hit);
    }
  } catch (err) {
    // Fail open, and mandatory rather than defensive: Express 4 does not catch
    // rejections from async middleware, so an uncaught one here would HANG the
    // request rather than 500 it. utils/cache.js already swallows Redis
    // failures, which leaves only a throwing versionKeys/buildKey to land
    // here — a programming error that must still not take the route down.
    return next();
  }

  res.locals.cache = "MISS";
  res.set("X-Cache", "MISS");

  /**
   * Capture the payload on its way out.
   *
   * Monkey-patching res.json is the only hook that sees the body: "finish"
   * fires after it has been serialised and sent, and res.locals cannot carry it
   * without every controller cooperating.
   *
   * Guarded on status 200 for correctness, not tidiness. A 404 from an unknown
   * post and a 403 both flow through res.json exactly like a success, and
   * caching one would serve another caller someone else's error for the whole
   * TTL — the kind of bug that only reproduces for the second person to ask.
   */
  const sendJson = res.json.bind(res);
  let isStored = false;

  res.json = (payload) => {
    if (!isStored && res.statusCode === 200) {
      isStored = true;
      // Deliberately NOT awaited. The response has already been computed and is
      // on its way; failing to memoise it is not a reason to delay or break it.
      // writeCached swallows its own errors, so this cannot reject unhandled.
      void writeCached(key, payload, ttlSec);
    }

    return sendJson(payload);
  };

  next();
};
