import * as routineRepo from "../repositories/studyRoutine.repository.js";
// Deleting a routine nulls posts.routineId via ON DELETE SET NULL — a write to
// posts that never passes through post.service.js, so its cache has to be told.
// See deleteSession for the identical case.
import { findPostRefsByRoutine } from "../repositories/post.repository.js";
import { invalidateDetachedPosts } from "./post.service.js";

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

export const createRoutine = async ({ userId, title }) => {
  return routineRepo.createRoutine({ userId, title, sourceRoutineId: null });
};

export const getRoutine = async (routineId, requesterId) => {
  return getOwnedRoutineOrThrow(routineId, requesterId);
};

export const listMyRoutines = async (userId) => {
  return routineRepo.findRoutinesByUser(userId);
};

export const updateRoutine = async (routineId, requesterId, { title }) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);
  return routineRepo.updateRoutine(routineId, { title });
};

export const deleteRoutine = async (routineId, requesterId) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  // Read BEFORE the delete — see deleteSession.
  const detached = await findPostRefsByRoutine(routineId);

  const result = await routineRepo.deleteRoutine(routineId);

  await invalidateDetachedPosts(detached);

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

  return routineRepo.findRoutineById(clone.id);
};

export const addTodoItem = async (routineId, requesterId, { title, dueDate }) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);
  return routineRepo.createTodoItem({ routineId, title, dueDate });
};

export const updateTodoItem = async (routineId, todoId, requesterId, data) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const todo = await routineRepo.findTodoItemById(todoId);
  if (!todo || todo.routineId !== routineId) throw todoNotFound();

  const { title, dueDate, isComplete } = data;
  return routineRepo.updateTodoItem(todoId, { title, dueDate, isComplete });
};

export const deleteTodoItem = async (routineId, todoId, requesterId) => {
  await getOwnedRoutineOrThrow(routineId, requesterId);

  const todo = await routineRepo.findTodoItemById(todoId);
  if (!todo || todo.routineId !== routineId) throw todoNotFound();

  return routineRepo.deleteTodoItem(todoId);
};
