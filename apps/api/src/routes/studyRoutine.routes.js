import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  update,
  remove,
  clone,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem,
} from "../controllers/studyRoutine.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import {
  routineIdParamSchema,
  routineTodoParamSchema,
  createRoutineSchema,
  updateRoutineSchema,
  createTodoItemSchema,
  updateTodoItemSchema,
} from "../validation/studyRoutine.validation.js";
import {
  routineContentVersionKey,
  routineOwnerVersionKey,
  routineKey,
  routineUserListKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_ROUTINE_SEC,
  CACHE_TTL_ROUTINE_LIST_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// See session.routes.js — routines and their todo items are all caller-owned.
router.use(requireAuth);

/**
 * Three buckets, all keyed on req.user.id and all in the routine keyspace.
 *
 * bulkLimit sits on DELETE /:id for the reason config/cache.js gives, and not
 * for row count: the delete cascades every todo item AND SetNulls the
 * sourceRoutineId of every clone anyone has ever taken of it. The blast radius
 * reaches other users' rows.
 *
 * POST /:id/clone stays on writeLimit despite writing N+1 rows. It is bounded
 * by the size of the source routine, creates nothing anyone else can see, and
 * is the feature working as intended rather than an abuse to bound.
 */
const readLimit = rateLimit({ name: "routine-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "routine-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "routine-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the two cacheable reads. See the note in
 * session.routes.js — this router is its exact shape.
 */

/**
 * GET /:id — owner-only, so THE VIEWER IS IN THE KEY. getRoutine routes through
 * getOwnedRoutineOrThrow and 403s for anyone but the owner, and cache() runs
 * before the controller. See the warning above routineKey.
 */
const cacheOne = cache({
  ttlSec: CACHE_TTL_ROUTINE_SEC,
  versionKeys: (req) => [routineContentVersionKey(req.params.id)],
  buildKey: (req, [version]) => routineKey(req.params.id, req.user.id, version),
});

// GET / — the caller's own routines. No by-user counterpart to share with, and
// it could not share anyway: findRoutinesByUser returns _count.todoItems where
// findRoutineById returns the items themselves.
const cacheMyList = cache({
  ttlSec: CACHE_TTL_ROUTINE_LIST_SEC,
  versionKeys: (req) => [routineOwnerVersionKey(req.user.id)],
  buildKey: (req, [version]) => routineUserListKey(req.user.id, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache. See the note in session.routes.js for why the limiter goes first.
 *
 * The /:id/todos/* routes are declared after the plain /:id ones, which is safe
 * in either order here — they are three segments deep, so "/:id" cannot swallow
 * them. Grouped for readability rather than correctness.
 */

router.post("/", writeLimit, validate({ body: createRoutineSchema }), create);

router.get("/", readLimit, cacheMyList, listMine);

router.get(
  "/:id",
  readLimit,
  validate({ params: routineIdParamSchema }),
  cacheOne,
  getOne,
);

router.patch(
  "/:id",
  writeLimit,
  validate({ params: routineIdParamSchema, body: updateRoutineSchema }),
  update,
);

router.delete(
  "/:id",
  bulkLimit,
  validate({ params: routineIdParamSchema }),
  remove,
);

// Deliberately NOT ownership-gated in the service — taking someone else's
// routine is the whole point. It is still a write, so it is still limited.
router.post(
  "/:id/clone",
  writeLimit,
  validate({ params: routineIdParamSchema }),
  clone,
);

router.post(
  "/:id/todos",
  writeLimit,
  validate({ params: routineIdParamSchema, body: createTodoItemSchema }),
  addTodoItem,
);

router.patch(
  "/:id/todos/:todoId",
  writeLimit,
  validate({ params: routineTodoParamSchema, body: updateTodoItemSchema }),
  updateTodoItem,
);

router.delete(
  "/:id/todos/:todoId",
  writeLimit,
  validate({ params: routineTodoParamSchema }),
  deleteTodoItem,
);

export default router;
