import { Router } from "express";
import {
  start,
  getOne,
  listMine,
  end,
  remove,
  addInterruption,
} from "../controllers/session.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import {
  sessionIdParamSchema,
  startSessionSchema,
  addInterruptionSchema,
} from "../validation/session.validation.js";
import {
  sessionContentVersionKey,
  sessionOwnerVersionKey,
  sessionKey,
  sessionUserListKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_SESSION_SEC,
  CACHE_TTL_SESSION_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
} from "../config/cache.js";

const router = Router();

// Every session route acts on the caller's own data, so authentication is a
// router-level concern rather than something each route opts into. Mounted
// before the table below, it also means a route added later is protected by
// default - the safe direction to fail.
router.use(requireAuth);

/**
 * Rate limiting is per-route rather than router-level, because the tiers
 * differ. Both buckets are keyed on req.user.id — see middleware/rateLimit.js
 * for why req.ip would be wrong. The `name` gives sessions their own keyspace,
 * so these budgets are independent of every other router despite sharing the
 * numbers.
 *
 * No bulk tier here, unlike posts and comments: this router has no
 * "delete everything" route. DELETE /:id cascades only its own interruptions
 * and detaches the caller's own posts, so RATE_LIMIT_WRITE is the right ceiling.
 */
const readLimit = rateLimit({ name: "session-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "session-write", ...RATE_LIMIT_WRITE });

/**
 * Cache configuration for the two cacheable reads.
 *
 * Declared beside the routes they serve, so this file stays the complete policy
 * for the resource — it already reads that way for authentication and rate
 * limiting. The key FORMATS live in utils/cache.js, because session.service.js
 * has to compose the matching version keys to invalidate.
 */

/**
 * GET /:id — owner-only, so THE VIEWER IS IN THE KEY.
 *
 * A security requirement rather than a cache-shaping choice: cache() runs
 * before the controller, so without the viewer the owner's 200 would be
 * replayed to the next caller as a HIT and never reach
 * getOwnedSessionOrThrow's 403. See the warning above sessionKey.
 *
 * Costs nothing — only one person can ever get a 200 from this route.
 */
const cacheOne = cache({
  ttlSec: CACHE_TTL_SESSION_SEC,
  versionKeys: (req) => [sessionContentVersionKey(req.params.id)],
  buildKey: (req, [version]) => sessionKey(req.params.id, req.user.id, version),
});

// GET / — the caller's own history. There is no by-user counterpart to share
// this key with; study history is private in this API.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_SESSION_LIST_SEC,
  versionKeys: (req) => [sessionOwnerVersionKey(req.user.id)],
  buildKey: (req, [version]) => sessionUserListKey(req.user.id, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound — and a request already over
 * the ceiling would do cache work before being refused anyway.
 *
 * validate() sits before cache() on the reads, matching post.routes.js and
 * users.routes.js: a malformed id gets the 400 that says so instead of being
 * composed into a cache key.
 */

router.post("/", writeLimit, validate({ body: startSessionSchema }), start);

router.get("/", readLimit, cacheMyList, listMine);

router.get(
  "/:id",
  readLimit,
  validate({ params: sessionIdParamSchema }),
  cacheOne,
  getOne,
);

router.patch(
  "/:id/end",
  writeLimit,
  validate({ params: sessionIdParamSchema }),
  end,
);

router.delete(
  "/:id",
  writeLimit,
  validate({ params: sessionIdParamSchema }),
  remove,
);

router.post(
  "/:id/interruptions",
  writeLimit,
  validate({ params: sessionIdParamSchema, body: addInterruptionSchema }),
  addInterruption,
);

export default router;
