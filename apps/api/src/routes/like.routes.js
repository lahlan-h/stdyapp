import { Router } from "express";
import {
  create,
  listByPost,
  summary,
  listMine,
  listByUser,
  removeByPost,
  removeMine,
  listAll,
  resolveTargetUserId,
} from "../controllers/like.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  likePostVersionKey,
  likeUserVersionKey,
  likeSummaryKey,
  likedByKey,
  likeUserListKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_LIKE_SUMMARY_SEC,
  CACHE_TTL_LIKED_BY_SEC,
  CACHE_TTL_LIKE_USER_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_LIKE_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// See session.routes.js — authentication is a router-level concern here rather
// than something each route opts into, so a route added later is protected by
// default. Reads are open to any authenticated caller (a like is public social
// data); it is the WRITES that are scoped to the token holder, inside the
// service. See the authorisation note at the top of like.service.js.
router.use(requireAuth);

/**
 * Rate limiting is per-route rather than router-level, because the tiers differ
 * and because GET /all is outside the caching half of this change.
 *
 * Three independent buckets, so reading a heart cannot spend the budget that
 * stands between a script and every like the caller has ever left. All three are
 * keyed on req.user.id — see middleware/rateLimit.js for why req.ip would be
 * wrong here. The `name` is what gives likes their own keyspace, so these
 * budgets are separate from the comment router's despite sharing two tiers.
 */
const readLimit = rateLimit({ name: "like-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "like-write", ...RATE_LIMIT_LIKE_WRITE });
const bulkLimit = rateLimit({ name: "like-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the four cacheable reads.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource — it already reads that way for authentication and
 * rate limiting. The key FORMATS live in utils/cache.js, because
 * like.service.js has to compose the matching version keys to invalidate.
 */
const cacheSummary = cache({
  ttlSec: CACHE_TTL_LIKE_SUMMARY_SEC,
  versionKeys: (req) => [likePostVersionKey(req.params.postId)],
  buildKey: (req, [postVersion]) =>
    likeSummaryKey(req.params.postId, req.user.id, postVersion),
});

const cacheLikedBy = cache({
  ttlSec: CACHE_TTL_LIKED_BY_SEC,
  versionKeys: (req) => [likePostVersionKey(req.params.postId)],
  buildKey: (req, [postVersion]) => likedByKey(req.params.postId, postVersion),
});

// GET / — the caller's own list. Shares likeUserListKey with the route below,
// because listMyLikes and listLikesByUser return byte-identical data.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_LIKE_USER_LIST_SEC,
  versionKeys: (req) => [likeUserVersionKey(req.user.id)],
  buildKey: (req, [userVersion]) => likeUserListKey(req.user.id, userVersion),
});

/**
 * GET /user/:userId.
 *
 * resolveTargetUserId is the SAME function the controller uses, imported rather
 * than reimplemented, and that is a correctness requirement rather than
 * tidiness. Keying on the raw param would build "…byuser:me:…" against a counter
 * (v:like:user:me) that nothing ever bumps — so every caller's GET /user/me
 * would share one cache entry and users would be served each other's like
 * history.
 */
const cacheUserList = cache({
  ttlSec: CACHE_TTL_LIKE_USER_LIST_SEC,
  versionKeys: (req) => [likeUserVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [userVersion]) =>
    likeUserListKey(resolveTargetUserId(req), userVersion),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound — and a request already over
 * the ceiling would do cache work before being refused anyway.
 */

// Post-scoped paths live in THIS file rather than in post.routes.js: every
// router here is a flat top-level resource that owns its own sub-paths
// (studyRoutine.routes.js owns /:id/todos, studyGroup.routes.js owns
// /:id/members), and two files owning likes is how one of these routes would
// eventually acquire the wrong auth rule by accident.
//
// Declared before the bare "/" routes, following post.routes.js. Note there is
// no "/:id" route at all — unlike is keyed by postId, which a client rendering
// a heart already has, whereas it may never have seen the like's own id. That
// removes the shadowing hazard post.routes.js has to warn about.
router.get("/post/:postId/count", readLimit, cacheSummary, summary);
router.get("/post/:postId", readLimit, cacheLikedBy, listByPost);
router.delete("/post/:postId", writeLimit, removeByPost);

router.get("/user/:userId", readLimit, cacheUserList, listByUser);
router.delete("/user/me", bulkLimit, removeMine);

// UNCACHED by request. It keeps a limiter anyway: it is the most expensive
// query in the file, and leaving the one route excluded from caching with no
// ceiling at all would be the wrong reading of "except /all".
//
// Grouped with the other literal paths for consistency with post.routes.js.
// Unlike there, ordering is not load-bearing here — this file declares no
// "/:id" route, so nothing can swallow a single-segment literal.
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

router.post("/", writeLimit, create);
router.get("/", readLimit, cacheMyList, listMine);

// No PATCH, and its absence next to post.routes.js is deliberate rather than an
// oversight. Every column on a like is either the primary key or half the row's
// identity: rewriting userId or postId does not EDIT a like, it makes it a
// different one — a delete plus a create. Post has a PATCH because caption and
// photoUrl are editable content; a like has no such field. If a reaction type
// is ever added, that is when a PATCH earns its place.

export default router;
