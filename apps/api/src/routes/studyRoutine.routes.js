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
  reset,
  reorderTodoItems,
  preview,
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
  resetRoutineSchema,
  reorderTodoItemsSchema,
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
  RATE_LIMIT_TODO_WRITE,
} from "../config/cache.js";

const router = Router();

// See session.routes.js — routines and their todo items are all caller-owned.
router.use(requireAuth);

/**
 * Three buckets, all keyed on req.user.id and all in the routine keyspace.
 *
 * todoLimit is for taps - ticking, unticking and reordering items - which come
 * in bursts while someone works down a list. See RATE_LIMIT_TODO_WRITE.
 *
 * DELETE /:id is on writeLimit. It used to be on the bulk tier; config/cache.js
 * says why it moved.
 *
 * POST /:id/clone stays on writeLimit despite writing N+1 rows. It is bounded
 * by the size of the source routine, creates nothing anyone else can see, and
 * is the feature working as intended rather than an abuse to bound.
 */
const readLimit = rateLimit({ name: "routine-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "routine-write", ...RATE_LIMIT_WRITE });
const todoLimit = rateLimit({ name: "routine-todo", ...RATE_LIMIT_TODO_WRITE });

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
  writeLimit,
  validate({ params: routineIdParamSchema }),
  remove,
);

/**
 * GET /:id/preview - someone else's routine, before cloning it.
 *
 * NOT CACHED. The answer depends on whether a block stands between viewer and
 * owner, and cache() runs before the controller, so a shared entry would serve
 * a blocked viewer straight past the check. Keying on the viewer would fix
 * that but would not be invalidated when a block is created. A preview is
 * opened rarely, one at a time; the read limit is the only bound it needs.
 *
 * Declared before nothing it could clash with: "/:id/preview" is two segments
 * deep, so GET "/:id" cannot swallow it.
 */
router.get(
  "/:id/preview",
  readLimit,
  validate({ params: routineIdParamSchema }),
  preview,
);

// Deliberately NOT ownership-gated in the service — taking someone else's
// routine is the whole point. It is still a write, so it is still limited.
// It IS block-gated, matching the preview above.
router.post(
  "/:id/clone",
  writeLimit,
  validate({ params: routineIdParamSchema }),
  clone,
);

// Unticks every item. One write, on writeLimit: it is a deliberate "start
// again", not a burst.
router.post(
  "/:id/reset",
  writeLimit,
  validate({ params: routineIdParamSchema, body: resetRoutineSchema }),
  reset,
);

router.post(
  "/:id/todos",
  writeLimit,
  validate({ params: routineIdParamSchema, body: createTodoItemSchema }),
  addTodoItem,
);

/**
 * PUT /:id/todos/order - the whole new order. PUT, not PATCH, because it
 * replaces the order outright; and a different verb from the PATCH below,
 * so "order" can never be read as a :todoId (it would fail the UUID check
 * anyway).
 */
router.put(
  "/:id/todos/order",
  todoLimit,
  validate({ params: routineIdParamSchema, body: reorderTodoItemsSchema }),
  reorderTodoItems,
);

router.patch(
  "/:id/todos/:todoId",
  todoLimit,
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
