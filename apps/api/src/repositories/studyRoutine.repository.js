import { prisma } from "@stdyapp/core";

export const createRoutine = ({ userId, title, sourceRoutineId }) => {
  return prisma.studyRoutine.create({
    data: { userId, title, sourceRoutineId: sourceRoutineId ?? null },
  });
};

export const findRoutineById = (id) => {
  return prisma.studyRoutine.findUnique({
    where: { id },
    include: { todoItems: { orderBy: { createdAt: "asc" } } },
  });
};

export const findRoutinesByUser = (userId) => {
  return prisma.studyRoutine.findMany({
    where: { userId },
    include: { _count: { select: { todoItems: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const updateRoutine = (id, data) => {
  return prisma.studyRoutine.update({ where: { id }, data });
};

export const deleteRoutine = (id) => {
  return prisma.studyRoutine.delete({ where: { id } });
};

export const createTodoItem = ({ routineId, title, dueDate }) => {
  return prisma.todoItem.create({
    data: { routineId, title, dueDate: dueDate ?? null },
  });
};

// bulk insert used by cloning — createMany is one round trip instead of N
export const createTodoItems = (routineId, items) => {
  return prisma.todoItem.createMany({
    data: items.map((item) => ({
      routineId,
      title: item.title,
      dueDate: item.dueDate ?? null,
      // deliberately no isComplete here — every clone starts fresh (default: false)
    })),
  });
};

export const findTodoItemById = (id) => {
  return prisma.todoItem.findUnique({ where: { id } });
};

export const updateTodoItem = (id, data) => {
  return prisma.todoItem.update({ where: { id }, data });
};

export const deleteTodoItem = (id) => {
  return prisma.todoItem.delete({ where: { id } });
};

/**
 * Which routines were cloned from this one, and who owns them?
 *
 * Asked by studyRoutine.service.js immediately BEFORE deleting a routine, for
 * the reason findSessionRefsByGroup gives in session.repository.js: clones take
 * ON DELETE SET NULL on sourceRoutineId, so deleting the original rewrites
 * every clone without passing through the owning user's code path at all.
 *
 * This is the one invalidation in the file that reaches OTHER USERS' cached
 * data - cloning is deliberately not ownership-gated, so the clones of a
 * routine generally belong to other people. Which is exactly why userId is
 * selected: their list counters are the ones that need bumping.
 *
 * @param {string} sourceRoutineId
 * @returns {Promise<Array<{ id: string, userId: string }>>}
 */
export const findRoutineRefsBySource = (sourceRoutineId) => {
  return prisma.studyRoutine.findMany({
    where: { sourceRoutineId },
    select: { id: true, userId: true },
  });
};
