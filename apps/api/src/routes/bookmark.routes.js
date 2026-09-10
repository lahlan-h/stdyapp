import { Router } from "express";
import {
  create,
  status,
  listMine,
  listAll,
  remove,
  removeMine,
} from "../controllers/bookmark.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  bookmarkPostIdParamSchema,
  createBookmarkSchema,
} from "../validation/bookmark.validation.js";
import {
  bookmarkUserVersionKey,
  bookmarkListKey,
  bookmarkStatusKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_BOOKMARK_LIST_SEC,
  CACHE_TTL_BOOKMARK_STATUS_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// Authentication is a router-level concern here rather than something each route
// opts into, so a route added later is protected by default.
//
// Where like.routes.js says "reads are open to any authenticated caller, it is
// the WRITES that are scoped", THIS router scopes both — the call block.routes.js
// makes. Every route below reads or writes only rows where the caller is the
// saver, enforced by the WHERE clause in bookmark.service.js. See the
// authorisation note at the top of that file.
router.use(requireAuth);

/**
 * Three independent buckets, so reading your own saved list cannot spend the
 * budget that stands between a script and clearing the whole list. All three are
 * keyed on req.user.id — see middleware/rateLimit.js for why req.ip would be
 * wrong here. The `name` is what gives bookmarks their own keyspace, so these
 * budgets are separate from every other router's despite sharing all three tiers.
 *
 * Note the write tier: RATE_LIMIT_WRITE, not the RATE_LIMIT_LIKE_WRITE its
 * closest structural sibling uses. See config/cache.js — that tier is 60/min
 * because a feed gets double-tapped rapidly, and saving a post is a deliberate
 * act. The write bucket covers the save and the unsave together, which is right:
 * both are the same kind of considered action on one row.
 */
const readLimit = rateLimit({ name: "bookmark-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "bookmark-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "bookmark-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the two cacheable reads.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource — it already reads that way for authentication and rate
 * limiting. The key FORMATS live in utils/cache.js, because bookmark.service.js
 * has to compose the matching version key to invalidate.
 *
 * ⚠ BOTH KEYS CARRY THE VIEWER, AND THAT IS A SECURITY REQUIREMENT rather than a
 * cache-shaping choice. cache() runs BEFORE the controller and therefore before
 * the service's scoping WHERE clause, so a viewer-less key would store one
 * caller's private saved list and hand it to the next caller as a HIT. Caching
 * would become the authorization bypass — the same trap block.routes.js warns
 * about, and it applies to every read in this router rather than to one route.
 *
 * Note also what is NOT here: neither key is shared between a "mine" route and a
 * "/user/:userId" route the way likeUserListKey is. There is no /user/:userId
 * read of this table to share with, and there must never be one.
 */
const cacheMyList = cache({
  ttlSec: CACHE_TTL_BOOKMARK_LIST_SEC,
  versionKeys: (req) => [bookmarkUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => bookmarkListKey(req.user.id, version),
});

// Stamped with the VIEWER's counter, and it needs no post counter: savedByMe and
// savedAt can only change when THIS viewer saves or unsaves THIS post, and both
// of those writes bump the viewer's counter. Same reasoning cacheStatus in
// block.routes.js gives.
const cacheStatus = cache({
  ttlSec: CACHE_TTL_BOOKMARK_STATUS_SEC,
  versionKeys: (req) => [bookmarkUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    bookmarkStatusKey(req.user.id, req.params.postId, version),
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
 * validate() sits before cache() on the reads, matching session.routes.js and
 * post.routes.js: a malformed postId gets the 400 that says so instead of being
 * composed into a cache key.
 */

// Post-scoped paths live in THIS file rather than in post.routes.js: every router
// here is a flat top-level resource that owns its own sub-paths
// (studyRoutine.routes.js owns /:id/todos, studyGroup.routes.js owns
// /:id/members), and two files owning bookmarks is how one of these routes would
// eventually acquire the wrong auth rule by accident.
//
// The two-segment form is declared before the bare "/post/:postId" out of
// convention rather than necessity — Express matches on segment count, so nothing
// here can shadow anything.
//
// THERE IS NO "/:id" ROUTE AT ALL, and every single-row path below is keyed by
// the POST instead. A client rendering a bookmark icon already holds the postId,
// whereas it may never have seen the bookmark's own id. That is also what removes
// the shadowing hazard post.routes.js has to warn about.
//
// ⚠ Note the absence of "/post/:postId" as a COLLECTION and of
// "/post/:postId/count", the counterparts of the routes like.routes.js has. Those
// would answer "who saved this post" and "how many people saved it", which are
// the exact facts this feature exists to withhold — from third parties and, above
// all, from the post's author. They are not missing pending implementation. They
// must never be added.
router.get(
  "/post/:postId/status",
  readLimit,
  validate({ params: bookmarkPostIdParamSchema }),
  cacheStatus,
  status,
);

router.delete(
  "/post/:postId",
  writeLimit,
  validate({ params: bookmarkPostIdParamSchema }),
  remove,
);

// "Clear my saved posts", and NOT at /user/me the way likes put their bulk
// delete. That spelling works there because "/user/:userId" already means
// something in that router; this one has no /user path at all and must never get
// one, so /mine is the unambiguous form — the call block.routes.js makes.
router.delete("/mine", bulkLimit, removeMine);

// ⚠ /all MEANS SOMETHING DIFFERENT IN THIS ROUTER, and the difference is
// deliberate. In the public routers it is one page of every row in the system.
// Here it is one page of the CALLER'S OWN bookmarks — see listMyBookmarksPage.
// There is no admin role in this codebase, so a global saved list would hand
// every user's reading history to any authenticated caller.
//
// The inconsistency is the lesser evil, exactly as block.routes.js argues: the
// alternative was omitting the route entirely and breaking the shape every other
// router offers a paginated client. It is called out here, in the controller and
// in the repository because a path that means "everything" in most places and
// "mine" in two is exactly how a future edit quietly drops the scope.
//
// UNCACHED, matching GET /all everywhere else. It keeps a limiter anyway — it is
// the most expensive query in the file, and leaving the one uncached route with
// no ceiling would be the wrong reading of "except /all".
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

router.post("/", writeLimit, validate({ body: createBookmarkSchema }), create);
router.get("/", readLimit, cacheMyList, listMine);

// No PATCH, and its absence is deliberate rather than an oversight — the same
// reasoning like.routes.js, follow.routes.js and block.routes.js all give. A
// bookmark is a TOGGLE: you save a post or you do not. id is the primary key,
// userId and postId are the row's identity, and rewriting either does not EDIT a
// bookmark, it makes it a different one — a delete plus a create.
//
// That leaves savedAt, which is the only column a PATCH could touch, and it is
// server-set ordering data rather than anything the user authors. A route that
// re-dated it would exist to serve a "move this back to the top" gesture, and
// this product has none: the bookmark icon is a two-state toggle, so tapping a
// saved post unsaves it and there is no second gesture left to mean "save it
// again". Adding the verb because CRUD has four letters would be inventing a
// route for a use case that does not exist.
//
// If saved posts ever grow collections or notes — the fields a user actually
// authors — that is when a PATCH earns its place, and it should edit those
// rather than the timestamp.

export default router;
