import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  listAll,
  update,
  remove,
  removeMine,
  statusForUser,
  statusForPost,
} from "../controllers/report.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  reportIdParamSchema,
  reportUserParamSchema,
  reportPostParamSchema,
  createReportSchema,
  updateReportSchema,
} from "../validation/report.validation.js";
import {
  reportUserVersionKey,
  reportListKey,
  reportPageKey,
  reportOneKey,
  reportStatusKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_REPORT_LIST_SEC,
  CACHE_TTL_REPORT_SEC,
  CACHE_TTL_REPORT_STATUS_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// Authentication is a router-level concern here rather than something each route
// opts into, so a route added later is protected by default.
//
// Where follow.routes.js says "reads are open to any authenticated caller, it is
// the WRITES that are scoped", THIS router scopes both — the call block.routes.js
// and bookmark.routes.js make. Every route below reads or writes only rows where
// the caller is the reporter. See the authorisation note at the top of
// report.service.js for why that is stricter here than anywhere else in the API:
// a report names a third party, and the person named must never learn it exists.
router.use(requireAuth);

/**
 * Three independent buckets, so reading your own reports cannot spend the budget
 * that stands between a script and dropping every one of them. All three are
 * keyed on req.user.id — see middleware/rateLimit.js for why req.ip would be
 * wrong here. The `name` is what gives reports their own keyspace, so these
 * budgets are separate from every other router's despite sharing all three tiers.
 *
 * Note the write tier: RATE_LIMIT_WRITE, not the RATE_LIMIT_LIKE_WRITE or
 * RATE_LIMIT_FOLLOW_WRITE that exist for a reflexive tap and an onboarding burst.
 * See config/cache.js — filing a report is the most deliberate action in this
 * app, made once per target, and nothing bulk-reports.
 */
const readLimit = rateLimit({ name: "report-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "report-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "report-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the reads — ALL FIVE of them.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource; it already reads that way for authentication and rate
 * limiting. The key FORMATS live in utils/cache.js, because report.service.js has
 * to compose the matching version key to invalidate.
 *
 * ⚠ EVERY KEY CARRIES THE VIEWER, AND THAT IS A SECURITY REQUIREMENT rather than
 * a cache-shaping choice. cache() runs BEFORE the controller and therefore before
 * the service's scoping WHERE clause and before getOwnedReportOrThrow, so a
 * viewer-less key would store one caller's accusations and hand them to the next
 * caller as a HIT. Caching would become the authorization bypass — the trap the
 * postKey block in utils/cache.js describes, here applying to every read in the
 * router and to the one payload in this API that names an accuser.
 *
 * Note also what is NOT here: no key is shared between a "mine" route and a
 * "/user/:userId" route the way followersKey and followingKey are. This router's
 * /user/:userId is a TARGET, not an owner — there is no by-user read of this
 * table to share with, and there must never be one.
 */
const cacheMyList = cache({
  ttlSec: CACHE_TTL_REPORT_LIST_SEC,
  versionKeys: (req) => [reportUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => reportListKey(req.user.id, version),
});

/**
 * THE ONLY CACHED /all IN THIS API, and the divergence is deliberate — see
 * reportPageKey in utils/cache.js for the full reasoning. In short: the reasons
 * every other /all is uncached (an unbounded ?q, or a global list every write in
 * the system invalidates) do not apply to one viewer's private rows over a page
 * and limit paginationQuerySchema has already capped.
 *
 * Mounted AFTER validate, which is what makes req.validated.query safe to read
 * here — and mandatory, since the raw ?page=01 and ?page=1 would otherwise
 * compose two keys for one answer.
 */
const cacheMyPage = cache({
  ttlSec: CACHE_TTL_REPORT_LIST_SEC,
  versionKeys: (req) => [reportUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    reportPageKey(
      req.user.id,
      req.validated.query.page,
      req.validated.query.limit,
      version,
    ),
});

// Stamped with the VIEWER's counter and no per-report one, which is the opposite
// call from the single-comment cache in comment.routes.js. It is safe here
// because only the reporter can ever get a 200 from this route, so every write
// that can change the row is a write by this viewer. See reportOneKey.
const cacheOne = cache({
  ttlSec: CACHE_TTL_REPORT_SEC,
  versionKeys: (req) => [reportUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    reportOneKey(req.validated.params.id, req.user.id, version),
});

// One builder, two routes, kept apart by the literal "u" / "p" discriminator: a
// user id and a post id are both uuids from the same space, so without it a
// collision between the two would answer the wrong question. See reportStatusKey.
const cacheUserStatus = cache({
  ttlSec: CACHE_TTL_REPORT_STATUS_SEC,
  versionKeys: (req) => [reportUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    reportStatusKey(req.user.id, "u", req.validated.params.userId, version),
});

const cachePostStatus = cache({
  ttlSec: CACHE_TTL_REPORT_STATUS_SEC,
  versionKeys: (req) => [reportUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    reportStatusKey(req.user.id, "p", req.validated.params.postId, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound.
 *
 * validate goes before cache, which is stricter than the ordering block.routes.js
 * uses and is required rather than tidy here: three of the five cache keys read
 * req.validated, so a cache mounted first would compose a key from unvalidated
 * client input.
 *
 * ⚠ DECLARATION ORDER IS LOAD-BEARING IN THIS FILE, and it is not in any of its
 * siblings. This is the first router in the social half of the API with a "/:id"
 * route, because a report is the first of these entities that is a RECORD a user
 * refers back to rather than a toggle keyed by its target. Express matches in
 * declaration order, so "/all" and "/mine" MUST be declared before "/:id" — the
 * other way round, GET /api/reports/all becomes a lookup for a report whose id is
 * the literal string "all", and answers 400 from reportIdParamSchema instead.
 * Block and bookmark have no "/:id" at all, so nothing there warns you.
 */

// Target-scoped paths live in THIS file rather than in users.routes.js or
// post.routes.js: every router here is a flat top-level resource that owns its
// own sub-paths, and two files owning reports is how one of these routes would
// eventually acquire the wrong auth rule by accident.
//
// Both answer "have I reported this", and NEITHER has a counterpart answering
// "who reported this" or "how many people reported this". Those are the exact
// facts this feature exists to withhold — from third parties, and above all from
// the reported party, for whom they are a retaliation vector. They are not
// missing pending implementation. They must never be added.
router.get(
  "/user/:userId/status",
  readLimit,
  validate({ params: reportUserParamSchema }),
  cacheUserStatus,
  statusForUser,
);
router.get(
  "/post/:postId/status",
  readLimit,
  validate({ params: reportPostParamSchema }),
  cachePostStatus,
  statusForPost,
);

// ⚠ /all MEANS SOMETHING DIFFERENT IN THIS ROUTER, exactly as it does in
// block.routes.js and bookmark.routes.js. In the public routers it is one page of
// every row in the system. Here it is one page of the CALLER'S OWN reports — see
// listMyReportsPage. There is no admin role in this codebase, so a global report
// list would hand the entire harassment graph to any authenticated caller.
//
// The inconsistency is the lesser evil: the alternative was omitting the route
// entirely and breaking the shape every other router offers a paginated client.
// It is called out here, in the controller and in the repository because a path
// that means "everything" in five places and "mine" in three is exactly how a
// future edit quietly drops the scope.
//
// CACHED, unlike GET /all everywhere else — the one place this router diverges
// from its siblings rather than following them. See cacheMyPage above.
//
// Declared before "/:id" — see the ordering warning above.
router.get(
  "/all",
  readLimit,
  validate({ query: paginationQuerySchema }),
  cacheMyPage,
  listAll,
);

// "Drop every report I have filed", and NOT at /user/me the way likes put their
// bulk delete. Here /user/:userId already means "the person being reported", so
// /user/me would read as "drop the reports against me" — a different operation,
// and the one operation this feature must never offer.
//
// Declared before "/:id" — see the ordering warning above.
router.delete("/mine", bulkLimit, removeMine);

router.get(
  "/:id",
  readLimit,
  validate({ params: reportIdParamSchema }),
  cacheOne,
  getOne,
);
router.patch(
  "/:id",
  writeLimit,
  validate({ params: reportIdParamSchema, body: updateReportSchema }),
  update,
);
router.delete(
  "/:id",
  writeLimit,
  validate({ params: reportIdParamSchema }),
  remove,
);

router.post("/", writeLimit, validate({ body: createReportSchema }), create);
router.get("/", readLimit, cacheMyList, listMine);

/**
 * THE PATCH ABOVE IS THE ONLY ONE IN THE SOCIAL HALF OF THIS API, and its
 * presence is as deliberate as its absence is in the other five routers.
 *
 * follow.routes.js, block.routes.js and bookmark.routes.js all close with a note
 * saying every column on their row is either the primary key or half the row's
 * identity, so rewriting one does not EDIT the row, it makes it a different one —
 * a delete plus a create. That reasoning still holds for the two columns this row
 * shares with them, which is why updateReportSchema refuses targetUserId and
 * targetPostId outright.
 *
 * What a report has that they do not is a status and a reason: a lifecycle and a
 * justification, both genuinely mutable, neither part of the row's identity. That
 * is the whole difference, and it is why this is the one entity here with an
 * updatedAt column.
 *
 * Only PENDING and WITHDRAWN are reachable through it today. The remaining three
 * states are moderator verdicts, gated in REPORTER_ALLOWED_STATUSES in
 * report.service.js — the single place that rule lives, so granting a moderator
 * those transitions later touches one function and nothing else.
 */

export default router;
