import * as routineRepo from "../repositories/studyRoutine.repository.js";
// Deleting a routine nulls posts.routineId via ON DELETE SET NULL — a write to
// posts that never passes through post.service.js, so its cache has to be told.
// See deleteSession for the identical case.
import { findPostRefsByRoutine } from "../repositories/post.repository.js";
import { invalidateDetachedPosts } from "./post.service.js";
import { findBlockBetween } from "../repositories/block.repository.js";
import {
  bumpVersions,
  routineContentVersionKey,
  routineOwnerVersionKey,
} from "../utils/cache.js";

const notFound = () => {
  const err = new Error("Routine not found");
  err.status = 404;
  return err;
};

const todoNotFound = () => {
  const err = new Error("Todo item not found");
  err.status = 404;
  return err;
};

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const forbidden = () => {
  const err = new Error("You don't have access to this routine");
  err.status = 403;
  return err;
};

// throws unless the routine exists AND belongs to requesterId — every
// mutating routine/todo function should route through this first
const getOwnedRoutineOrThrow = async (routineId, requesterId) => {
  const routine = await routineRepo.findRoutineById(routineId);
  if (!routine) throw notFound();
  if (routine.userId !== requesterId) throw forbidden();
  return routine;
};

/**
 * Throws a 404 when a block stands between the routine's owner and someone
 * else, in either direction.
 *
 * 404 rather than 403, as everywhere blocks are enforced: a 403 would confirm
 * the routine exists and that a block is the reason, which is exactly what a
 * block is meant to hide. The owner is never blocked from their own routine.
 */
const assertNotBlocked = async (ownerId, viewerId) => {
  if (ownerId === viewerId) return;
  if (await findBlockBetween(ownerId, viewerId)) throw notFound();
};

/**
 * Invalidates this module's cached reads.
 *
 * The session/post shape: one counter per routine, one per owner. Nothing here
 * can fail a write — bumpVersions swallows its own Redis errors — and it is
 * awaited rather than fired and forgotten, so a client reading straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {{ routineIds?: string[], ownerIds?: string[] }} scope
 */
const invalidateRoutine = async ({ routineIds = [], ownerIds = [] }) => {
  await bumpVersions([
    ...routineIds.map(routineContentVersionKey),
    ...ownerIds.map(routineOwnerVersionKey),
  ]);
};

export const createRoutine = async ({ userId, title }) => {
  const routine = await routineRepo.createRoutine({
    userId,
    title,
    sourceRoutineId: null,
  });

  // OWNER scope only, for startSession's reason: a brand new routine has no
  // cached single-routine payload to orphan, but it belongs in the caller's
  // list, which someone may well have cached a moment ago.
  await invalidateRoutine({ ownerIds: [userId] });

  return routine;
};

export const getRoutine = async (routineId, requesterId) => {
  return getOwnedRoutineOrThrow(routineId, requesterId);
};

export const listMyRoutines = async (userId) => {
  return routineRepo.findRoutinesByUser(userId);
};

export const updateRoutine = async (routineId, requesterId, { title }) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const updated = await routineRepo.updateRoutine(routineId, { title });

  // AFTER the write resolves — bumping first lets a reader observe the new
  // version, query the not-yet-committed row and cache the OLD body under the
  // NEW key. Both scopes: the title appears in the single-routine payload and
  // in every row of findRoutinesByUser.
  await invalidateRoutine({ routineIds: [routineId], ownerIds: [requesterId] });

  return updated;
};

export const deleteRoutine = async (routineId, requesterId) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  // Read BEFORE the delete — see deleteSession. Two reads, because a routine
  // delete detaches two different things via ON DELETE SET NULL: the posts that
  // referenced it, and every CLONE anyone took of it.
  const [detachedPosts, detachedClones] = await Promise.all([
    findPostRefsByRoutine(routineId),
    routineRepo.findRoutineRefsBySource(routineId),
  ]);

  const result = await routineRepo.deleteRoutine(routineId);

  // The routine itself, plus the clones — whose sourceRoutineId just became
  // NULL. This is the one invalidation in the file that reaches OTHER USERS'
  // cached data: cloning is deliberately not ownership-gated, so those clones
  // generally belong to other people, and their list counters need the bump as
  // much as the clone payloads do.
  await invalidateRoutine({
    routineIds: [routineId, ...detachedClones.map((clone) => clone.id)],
    // Not de-duplicated here: bumpVersions builds a Set, so one user holding
    // several clones still costs one bump.
    ownerIds: [requesterId, ...detachedClones.map((clone) => clone.userId)],
  });

  await invalidateDetachedPosts(detachedPosts);

  return result;
};

// "take" someone else's routine — deliberately does NOT require the
// requester to own the source routine, that's the whole point. Copies the
// routine and its tasks into a new set of rows under the requester, with
// isComplete reset (a fresh copy shouldn't inherit someone else's progress)
// and sourceRoutineId pointing back to the original for provenance.
export const cloneRoutine = async (sourceRoutineId, requesterId) => {
  const source = await routineRepo.findRoutineById(sourceRoutineId);
  if (!source) throw notFound();
  // Not ownership-gated, but block-gated: a block hides a person's routines
  // from preview, and cloning must not be a way round that.
  await assertNotBlocked(source.userId, requesterId);

  const clone = await routineRepo.createRoutine({
    userId: requesterId,
    title: source.title,
    sourceRoutineId: source.id,
  });

  if (source.todoItems.length > 0) {
    await routineRepo.createTodoItems(
      clone.id,
      source.todoItems.map((item) => ({ title: item.title, dueDate: item.dueDate }))
    );
  }

  // OWNER scope, and the owner is the REQUESTER rather than the source's owner:
  // the new rows land under whoever took the copy. The source routine is not
  // modified at all, so its counters stay put.
  await invalidateRoutine({ ownerIds: [requesterId] });

  return routineRepo.findRoutineById(clone.id);
};

export const addTodoItem = async (routineId, requesterId, { title, dueDate }) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const position = await routineRepo.findNextTodoPosition(routineId);
  const todo = await routineRepo.createTodoItem({ routineId, title, dueDate, position });

  // BOTH scopes. findRoutineById embeds the items themselves, and
  // findRoutinesByUser embeds _count.todoItems — so adding one changes the
  // single-routine payload AND one row of the list. Contrast updateTodoItem
  // below, which changes the count not at all.
  await invalidateRoutine({ routineIds: [routineId], ownerIds: [requesterId] });

  return todo;
};

export const updateTodoItem = async (routineId, todoId, requesterId, data) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const todo = await routineRepo.findTodoItemById(todoId);
  if (!todo || todo.routineId !== routineId) throw todoNotFound();

  const { title, dueDate, isComplete } = data;

  const updated = await routineRepo.updateTodoItem(todoId, {
    title,
    dueDate,
    isComplete,
  });

  // CONTENT always. OWNER only when the tick changed: findRoutinesByUser now
  // carries completedCount, so ticking a box moves a number in the list, but
  // renaming an item or changing its due date still does not touch the list
  // and should not discard it.
  await invalidateRoutine({
    routineIds: [routineId],
    ownerIds: isComplete === undefined ? [] : [requesterId],
  });

  return updated;
};

export const deleteTodoItem = async (routineId, todoId, requesterId) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const todo = await routineRepo.findTodoItemById(todoId);
  if (!todo || todo.routineId !== routineId) throw todoNotFound();

  const result = await routineRepo.deleteTodoItem(todoId);

  // Both scopes, matching addTodoItem: a delete moves the count.
  await invalidateRoutine({ routineIds: [routineId], ownerIds: [requesterId] });

  return result;
};

/**
 * Unticks every item in a routine, so it can be worked through again.
 *
 * One write instead of one PATCH per item, which also keeps a long routine
 * clear of the todo rate limit. Answers the routine as GET /:id would, because
 * every box on the screen has just changed.
 */
export const resetRoutine = async (routineId, requesterId) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const { count } = await routineRepo.resetTodoItems(routineId);

  // Both scopes, but only if something changed: completedCount is in the list.
  if (count > 0) {
    await invalidateRoutine({ routineIds: [routineId], ownerIds: [requesterId] });
  }

  return routineRepo.findRoutineById(routineId);
};

/**
 * Puts a routine's items in the order given.
 *
 * todoIds must be EXACTLY this routine's items - every one, once each. A
 * partial list is refused rather than merged, because "move these three to the
 * top" has no single meaning when other items exist, and a client working from
 * a stale list would quietly scramble the order. A 400 tells it to reload.
 */
export const reorderTodoItems = async (routineId, requesterId, todoIds) => {
  const routine = await getOwnedRoutineOrThrow(routineId, requesterId);

  const current = new Set(routine.todoItems.map((item) => item.id));
  const sameItems =
    todoIds.length === current.size && todoIds.every((id) => current.has(id));
  if (!sameItems) {
    throw badRequest("todoIds must list every item in this routine exactly once");
  }

  await routineRepo.setTodoPositions(routineId, todoIds);

  // CONTENT only: the list carries counts, which an order change leaves alone.
  await invalidateRoutine({ routineIds: [routineId] });

  return routineRepo.findRoutineById(routineId);
};

/**
 * Someone else's routine, as far as is needed to decide whether to clone it.
 *
 * Gated like clone - anyone signed in who has the id, unless a block stands
 * between them - because a preview of something you may take is no more than
 * the take itself would reveal. Shaped as findRoutinePreview selects it, with
 * the count added so a client need not count the array.
 */
export const previewRoutine = async (routineId, viewerId) => {
  const routine = await routineRepo.findRoutinePreview(routineId);
  if (!routine) throw notFound();
  await assertNotBlocked(routine.userId, viewerId);

  const { userId, user, ...rest } = routine;
  return {
    ...rest,
    owner: user,
    isOwn: userId === viewerId,
    todoCount: routine.todoItems.length,
  };
};
