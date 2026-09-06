import { Router } from "express";
import {
  create,
  summary,
  listFollowers,
  listFollowing,
  listMine,
  remove,
  removeFollower,
  removeMine,
  listAll,
  resolveTargetUserId,
} from "../controllers/follow.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  followUserVersionKey,
  followSummaryKey,
  followersKey,
  followingKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_FOLLOW_SUMMARY_SEC,
  CACHE_TTL_FOLLOW_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_FOLLOW_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// See like.routes.js — authentication is a router-level concern here rather than
// something each route opts into, so a route added later is protected by
// default. Reads are open to any authenticated caller (a follow graph is public
// social data); it is the WRITES that are scoped to the token holder, inside the
// service. See the authorisation note at the top of follow.service.js.
router.use(requireAuth);

/**
 * Three independent buckets, so reading a profile's follower count cannot spend
 * the budget that stands between a script and every follow the caller has ever
 * made. All three are keyed on req.user.id — see middleware/rateLimit.js for why
 * req.ip would be wrong here. The `name` is what gives follows their own
 * keyspace, so these budgets are separate from the like and comment routers'
 * despite sharing two tiers.
 */
const readLimit = rateLimit({ name: "follow-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "follow-write", ...RATE_LIMIT_FOLLOW_WRITE });
const bulkLimit = rateLimit({ name: "follow-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the four cacheable reads.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource — it already reads that way for authentication and
 * rate limiting. The key FORMATS live in utils/cache.js, because
 * follow.service.js has to compose the matching version keys to invalidate.
 *
 * EVERY ONE of them resolves ":userId" through resolveTargetUserId, the SAME
 * function the controller uses, imported rather than reimplemented. That is a
 * correctness requirement rather than tidiness: keying on the raw param would
 * build "…:me:…" against a counter (v:follow:user:me) that nothing ever bumps,
 * so every caller's /user/me read would share one cache entry and users would be
 * served each other's follow graphs.
 *
 * Note that all four need only ONE version key — the target user's. A single
 * counter per user covers their follower list, their following list and their
 * summary at once, because every event that can change any of those touches an
 * edge with that user on one end. See the follow block in utils/cache.js.
 */
const cacheSummary = cache({
  ttlSec: CACHE_TTL_FOLLOW_SUMMARY_SEC,
  versionKeys: (req) => [followUserVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [version]) =>
    followSummaryKey(resolveTargetUserId(req), req.user.id, version),
});

const cacheFollowers = cache({
  ttlSec: CACHE_TTL_FOLLOW_LIST_SEC,
  versionKeys: (req) => [followUserVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [version]) =>
    followersKey(resolveTargetUserId(req), version),
});

const cacheFollowing = cache({
  ttlSec: CACHE_TTL_FOLLOW_LIST_SEC,
  versionKeys: (req) => [followUserVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [version]) =>
    followingKey(resolveTargetUserId(req), version),
});

// GET / — the caller's own following list. Shares followingKey with the route
// above, because listMyFollowing and listFollowingByUser return byte-identical
// data. If those two response shapes ever diverge, they must stop sharing it.
const cacheMyFollowing = cache({
  ttlSec: CACHE_TTL_FOLLOW_LIST_SEC,
  versionKeys: (req) => [followUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => followingKey(req.user.id, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound — and a request already over
 * the ceiling would do cache work before being refused anyway.
 */

// User-scoped paths live in THIS file rather than in users.routes.js: every
// router here is a flat top-level resource that owns its own sub-paths, and two
// files owning follows is how one of these routes would eventually acquire the
// wrong auth rule by accident.
//
// The two-segment forms are declared before the bare "/user/:userId" out of
// convention rather than necessity — Express matches on segment count, so
// nothing here can shadow anything. There is no "/:id" route at all: unfollow is
// keyed by the other person's id, which a client rendering a Follow button
// already has, whereas it may never have seen the edge's own id.
router.get("/user/:userId/count", readLimit, cacheSummary, summary);
router.get("/user/:userId/followers", readLimit, cacheFollowers, listFollowers);
router.get("/user/:userId/following", readLimit, cacheFollowing, listFollowing);
router.delete("/user/:userId", writeLimit, remove);

// The one route where the caller is the FOLLOWEE rather than the follower — see
// removeFollower in the controller. It sits on its own path prefix precisely so
// that distinction is visible in the URL: /user/:userId is someone you follow,
// /followers/:userId is someone who follows you.
router.delete("/followers/:userId", writeLimit, removeFollower);

// "Unfollow everyone", and NOT at /user/me the way likes put their bulk delete.
// Here /user/:userId already means "the person being followed", so /user/me
// would read as "unfollow myself" — a different operation, and one that does not
// exist.
router.delete("/mine", bulkLimit, removeMine);

// UNCACHED, matching GET /all in every other router: every follow write anywhere
// would invalidate the whole thing. It keeps a limiter anyway — it is the most
// expensive query in the file, and leaving the one uncached route with no
// ceiling at all would be the wrong reading of "except /all".
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

router.post("/", writeLimit, create);
router.get("/", readLimit, cacheMyFollowing, listMine);

// No PATCH, and its absence is deliberate rather than an oversight — the same
// reasoning like.routes.js gives. Every column on a follow is either the primary
// key or half the row's identity: rewriting followerId or followingId does not
// EDIT a follow, it makes it a different one, which is a delete plus a create.

export default router;
