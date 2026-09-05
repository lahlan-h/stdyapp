import { Router } from "express";
import {
  create,
  getOne,
  listByPost,
  summary,
  listMine,
  listByUser,
  update,
  remove,
  removeMine,
  listAll,
  resolveTargetUserId,
} from "../controllers/comment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  postVersionKey,
  userVersionKey,
  commentVersionKey,
  threadKey,
  summaryKey,
  commentKey,
  userListKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_THREAD_SEC,
  CACHE_TTL_SUMMARY_SEC,
  CACHE_TTL_COMMENT_SEC,
  CACHE_TTL_USER_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// See post.routes.js — authentication is a router-level concern rather than
// something each route opts into, so a route added here later is protected by
// default. That matters more in this file than most: reads here are open to any
// authenticated caller, so requireAuth is the only gate a read route has.
//
// It is also what populates req.user, which both middlewares below key on.
router.use(requireAuth);

/**
 * Rate limiting is per-route rather than router-level, because the tiers differ
 * and because GET /all is deliberately outside the caching half of this change.
 *
 * Three independent buckets, so reading a thread cannot spend the budget that
 * stands between a script and every comment the caller has ever written. All
 * three are keyed on req.user.id — see middleware/rateLimit.js for why req.ip
 * would be wrong here.
 */
const readLimit = rateLimit({ name: "cmt-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "cmt-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "cmt-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the five cacheable reads.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource — it already reads that way for authentication and
 * rate limiting, and a cache rule hidden a layer down is exactly the kind of
 * thing a reviewer misses. The key FORMATS live in utils/cache.js, because
 * comment.service.js has to compose the matching version keys to invalidate.
 */
const cacheThread = cache({
  ttlSec: CACHE_TTL_THREAD_SEC,
  versionKeys: (req) => [postVersionKey(req.params.postId)],
  buildKey: (req, [postVersion]) => threadKey(req.params.postId, postVersion),
});

const cacheSummary = cache({
  ttlSec: CACHE_TTL_SUMMARY_SEC,
  versionKeys: (req) => [postVersionKey(req.params.postId)],
  buildKey: (req, [postVersion]) =>
    summaryKey(req.params.postId, req.user.id, postVersion),
});

const cacheComment = cache({
  ttlSec: CACHE_TTL_COMMENT_SEC,
  versionKeys: (req) => [commentVersionKey(req.params.id)],
  buildKey: (req, [commentVersion]) => commentKey(req.params.id, commentVersion),
});

// GET / — the caller's own list. Shares userListKey with the route below,
// because listMyComments and listCommentsByUser return byte-identical data.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_USER_LIST_SEC,
  versionKeys: (req) => [userVersionKey(req.user.id)],
  buildKey: (req, [userVersion]) => userListKey(req.user.id, userVersion),
});

/**
 * GET /user/:userId.
 *
 * resolveTargetUserId is the SAME function the controller uses, imported rather
 * than reimplemented, and that is a correctness requirement rather than tidiness.
 * Keying on the raw param would build "…byuser:me:…" against a counter
 * (v:user:me) that nothing ever bumps — so every caller's GET /user/me would
 * share one cache entry and users would be served each other's comment history.
 */
const cacheUserList = cache({
  ttlSec: CACHE_TTL_USER_LIST_SEC,
  versionKeys: (req) => [userVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [userVersion]) =>
    userListKey(resolveTargetUserId(req), userVersion),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound — and a request already over
 * the ceiling would do cache work before being refused anyway.
 */

// The post-scoped routes live HERE, in the sub-resource's own router, rather
// than in post.routes.js — the rule like.routes.js sets out. Two files owning
// comments is how one of these routes eventually acquires the wrong auth rule by
// accident.
//
// "/count" is declared above its parent so a "/post/:postId/:something" added
// later cannot shadow it.
router.get("/post/:postId/count", readLimit, cacheSummary, summary);
router.get("/post/:postId", readLimit, cacheThread, listByPost);

// Two segments deep, so "/:id" below cannot swallow them either way — but
// declared first so that adding a "/user/:userId" DELETE later cannot silently
// shadow "/user/me".
//
// listByUser is the one route here that reads a named person's data; the bulk
// delete is strictly self-only and takes its target from the token.
router.get("/user/:userId", readLimit, cacheUserList, listByUser);
router.delete("/user/me", bulkLimit, removeMine);

// MUST stay above GET "/:id". That pattern is a single segment, so it matches
// "all" too — a /all declared after it would never run, and the request would
// instead reach getOne, look up a comment whose id is literally "all", and
// answer 404 "Comment not found". A silently wrong answer rather than a routing
// error.
//
// This is also the only route in this file that validates its query string and
// returns a { data, pagination } envelope; see the note on listAll.
//
// It is UNCACHED by request. It keeps a limiter anyway: it is the most
// expensive query in the file, and leaving the one route excluded from caching
// with no ceiling at all would be the wrong reading of "except /all".
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

router.post("/", writeLimit, create);
router.get("/", readLimit, cacheMyList, listMine);
router.get("/:id", readLimit, cacheComment, getOne);
router.patch("/:id", writeLimit, update);
router.delete("/:id", writeLimit, remove);

export default router;
