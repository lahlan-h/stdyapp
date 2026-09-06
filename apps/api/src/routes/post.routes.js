import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  listByUser,
  update,
  remove,
  removeMine,
  listAll,
  uploadPhoto,
  resolveTargetUserId,
} from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { rawImage } from "../middleware/rawImage.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  createPostSchema,
  updatePostSchema,
  postIdParamSchema,
} from "../validation/post.validation.js";
import { IMAGE_MIME_TYPES, MAX_POST_PHOTO_BYTES } from "../config/upload.js";
import {
  postContentVersionKey,
  postAuthorVersionKey,
  postKey,
  postUserListKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_POST_SEC,
  CACHE_TTL_POST_USER_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
  RATE_LIMIT_POST_PHOTO_WRITE,
} from "../config/cache.js";

const router = Router();

// See session.routes.js — every post route acts on the caller's own data, so
// authentication is a router-level concern rather than something each route
// opts into, and a route added later is protected by default.
router.use(requireAuth);

/**
 * Rate limiting is per-route rather than router-level, because the tiers differ
 * and because GET /all is outside the caching half of this change.
 *
 * Three independent buckets, so reading a post cannot spend the budget that
 * stands between a script and every post the caller has ever written. All three
 * are keyed on req.user.id — see middleware/rateLimit.js for why req.ip would be
 * wrong. The `name` gives posts their own keyspace, so these budgets are
 * separate from the comment and like routers despite sharing all three tiers.
 */
const readLimit = rateLimit({ name: "post-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "post-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "post-bulk", ...RATE_LIMIT_BULK });

// A fourth bucket on its own tier. POST / is a small JSON body again now that
// the bytes moved to POST /photo, so the tight tier belongs on the route that
// actually carries megabytes - and, unlike an avatar upload, one that leaves an
// object behind whether or not a post ever references it. See
// RATE_LIMIT_POST_PHOTO_WRITE.
const photoLimit = rateLimit({ name: "post-photo", ...RATE_LIMIT_POST_PHOTO_WRITE });

/**
 * Cache configuration for the three cacheable reads.
 *
 * Declared beside the routes they serve, so this file stays the complete policy
 * for the resource — it already reads that way for authentication and rate
 * limiting. The key FORMATS live in utils/cache.js, because post.service.js has
 * to compose the matching version keys to invalidate.
 */

/**
 * GET /:id — the ONE cached read in this API that is owner-only.
 *
 * The viewer is in the key, and that is a security requirement rather than a
 * cache-shaping choice: cache() runs before the controller, so without it the
 * author's 200 would be replayed to the next caller as a HIT, never reaching
 * getOwnedPostOrThrow's 403. See the warning above postKey in utils/cache.js.
 * Costs nothing — only one person can ever get a 200 from this route.
 */
const cacheOne = cache({
  ttlSec: CACHE_TTL_POST_SEC,
  versionKeys: (req) => [postContentVersionKey(req.params.id)],
  buildKey: (req, [postVersion]) => postKey(req.params.id, req.user.id, postVersion),
});

// GET / — the caller's own list. Shares postUserListKey with the route below,
// because listMyPosts and listPostsByUser return byte-identical data.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_POST_USER_LIST_SEC,
  versionKeys: (req) => [postAuthorVersionKey(req.user.id)],
  buildKey: (req, [userVersion]) => postUserListKey(req.user.id, userVersion),
});

/**
 * GET /user/:userId.
 *
 * resolveTargetUserId is the SAME function the controller uses, imported rather
 * than reimplemented — a correctness requirement, not tidiness. Keying on the
 * raw param would build "…byuser:me:…" against a counter nothing ever bumps, so
 * every caller's GET /user/me would share one entry and users would be served
 * each other's posts.
 */
const cacheUserList = cache({
  ttlSec: CACHE_TTL_POST_USER_LIST_SEC,
  versionKeys: (req) => [postAuthorVersionKey(resolveTargetUserId(req))],
  buildKey: (req, [userVersion]) =>
    postUserListKey(resolveTargetUserId(req), userVersion),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound — and a request already over
 * the ceiling would do cache work before being refused anyway.
 */

// The /user/* routes are two segments deep, so "/:id" below cannot swallow
// them either way — but they are declared FIRST so that adding a
// "/user/:userId" DELETE later cannot silently shadow "/user/me".
//
// listByUser is the one route here that reads someone else's data; the bulk
// delete is strictly self-only and takes its target from the token.
router.get("/user/:userId", readLimit, cacheUserList, listByUser);
router.delete("/user/me", bulkLimit, removeMine);

// MUST stay above GET "/:id". That pattern is a single segment, so it matches
// "all" too — a /all declared after it would never run, and the request would
// instead reach getOne, look up a post whose id is literally "all", and answer
// 404 "Post not found". A silently wrong answer rather than a routing error.
//
// This is also the only route in this file that validates its query string and
// returns a { data, pagination } envelope; see the note on listAll.
//
// UNCACHED by request. It keeps a limiter anyway, matching like.routes.js: it is
// the most expensive query in the file — a paginated global feed with joins and
// a COUNT — and leaving the one route excluded from caching with no ceiling at
// all would be the wrong reading of "except /all".
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

/**
 * Step one of creating a post: stage the photo, get a key back.
 *
 * MUST be declared above GET "/:id", and this is not merely stylistic tidying.
 * ":id" matches a single segment, so it matches the literal "photo" - before
 * this route existed, GET /api/posts/photo reached getOne with id === "photo"
 * and answered a confident "Post not found". That is the same trap the note
 * above /all describes. Declaring literals before parameters is what stops the
 * next person adding a sibling here and finding one verb works and another
 * silently does not. (postIdParamSchema on the /:id routes below now upgrades
 * that class of mistake to a 400 that names the problem.)
 *
 * rawImage AFTER the limiter, per the rule users.routes.js documents: do not
 * buffer megabytes into process memory for a request already over budget. There
 * is no ownership gate to run first - the object lands under the caller's own
 * id, so any authenticated user may stage a photo.
 *
 * The global express.json() in index.js is not a conflict: it claims
 * application/json only, so an image Content-Type streams past it unread.
 */
router.post(
  "/photo",
  photoLimit,
  rawImage({ types: IMAGE_MIME_TYPES, limit: MAX_POST_PHOTO_BYTES }),
  uploadPhoto,
);

// Step two. Plain JSON again - the bytes already arrived above, and this body
// carries only the caption, the links and the key naming them.
router.post("/", writeLimit, validate({ body: createPostSchema }), create);
router.get("/", readLimit, cacheMyList, listMine);
// validate() sits before cache() on the read, which is new to this router and
// matches what users.routes.js does: a bad id gets the 400 that says so instead
// of composing a cache key out of junk.
router.get("/:id", readLimit, validate({ params: postIdParamSchema }), cacheOne, getOne);

router.patch(
  "/:id",
  writeLimit,
  validate({ params: postIdParamSchema, body: updatePostSchema }),
  update,
);

router.delete("/:id", writeLimit, validate({ params: postIdParamSchema }), remove);

export default router;
