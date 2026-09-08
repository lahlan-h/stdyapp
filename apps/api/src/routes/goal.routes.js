import { Router } from "express";
import {
  set,
  getOne,
  getProgress,
  listMine,
  remove,
} from "../controllers/goal.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import {
  goalPeriodParamSchema,
  upsertGoalSchema,
} from "../validation/goal.validation.js";
import {
  goalOwnerVersionKey,
  sessionOwnerVersionKey,
  goalListKey,
  goalKey,
  goalProgressKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_GOAL_LIST_SEC,
  CACHE_TTL_GOAL_PROGRESS_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
} from "../config/cache.js";

const router = Router();

// See session.routes.js - every goal is caller-owned, and every route here
// takes its subject from the token rather than the path.
router.use(requireAuth);

/**
 * Two buckets, both keyed on req.user.id and both in the goal keyspace.
 *
 * There is no bulkLimit in this router. DELETE /:period is the only delete, and
 * it removes exactly one row belonging to the caller, cascades nothing and
 * touches nobody else's data - see config/cache.js for why that keeps it on the
 * write tier.
 */
const readLimit = rateLimit({ name: "goal-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "goal-write", ...RATE_LIMIT_WRITE });

/**
 * Cache configuration for the three cacheable reads.
 *
 * ⚠ Every buildKey below reads req.validated rather than req.params, which is
 * safe ONLY because validate() is mounted ahead of cache() on each route. That
 * ordering is load-bearing here in a way it is not in session.routes.js: the
 * period is TRANSFORMED during validation (lowercase in the URL, uppercase in
 * the database), so a key built from the raw param would be a different string
 * from the one the invalidation reasoning assumes.
 */

// GET / - the caller's goals. Owner scope only.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_GOAL_LIST_SEC,
  versionKeys: (req) => [goalOwnerVersionKey(req.user.id)],
  buildKey: (req, [version]) => goalListKey(req.user.id, version),
});

// GET /:period - one row of that same list, under its own key because the
// payload is a different shape.
const cacheOne = cache({
  ttlSec: CACHE_TTL_GOAL_LIST_SEC,
  versionKeys: (req) => [goalOwnerVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    goalKey(req.user.id, req.validated.params.period, version),
});

/**
 * GET /:period/progress - the only key in the codebase stamped with counters
 * from two different domains. The target moves when a goal is written; the
 * minutes move when a session ends. See the warning above goalProgressKey.
 *
 * The order of versionKeys is the order buildKey destructures them, and the two
 * must be changed together.
 */
const cacheProgress = cache({
  ttlSec: CACHE_TTL_GOAL_PROGRESS_SEC,
  versionKeys: (req) => [
    goalOwnerVersionKey(req.user.id),
    sessionOwnerVersionKey(req.user.id),
  ],
  buildKey: (req, [goalVersion, sessionVersion]) =>
    goalProgressKey(
      req.user.id,
      req.validated.params.period,
      goalVersion,
      sessionVersion,
    ),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache. See the note in session.routes.js for why the limiter goes first.
 *
 * /:period/progress is declared before /:period for readability only. Express
 * matches on the full path rather than a prefix, so a two-segment route cannot
 * be swallowed by a one-segment one in either order.
 */

router.get("/", readLimit, cacheMyList, listMine);

router.get(
  "/:period/progress",
  readLimit,
  validate({ params: goalPeriodParamSchema }),
  cacheProgress,
  getProgress,
);

router.get(
  "/:period",
  readLimit,
  validate({ params: goalPeriodParamSchema }),
  cacheOne,
  getOne,
);

/**
 * PUT rather than POST, because setting a target is an UPSERT and therefore
 * idempotent - see upsertGoalSchema. There is deliberately no POST / and no
 * PATCH /:period: the unique constraint means there is never a second goal of a
 * period to create, and a partial update of a single-field resource is just the
 * same write.
 */
router.put(
  "/:period",
  writeLimit,
  validate({ params: goalPeriodParamSchema, body: upsertGoalSchema }),
  set,
);

router.delete(
  "/:period",
  writeLimit,
  validate({ params: goalPeriodParamSchema }),
  remove,
);

export default router;
