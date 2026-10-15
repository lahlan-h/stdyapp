import { prisma } from "@stdyapp/core";

export const createRoutine = ({ userId, title, sourceRoutineId }) => {
  return prisma.studyRoutine.create({
    data: { userId, title, sourceRoutineId: sourceRoutineId ?? null },
  });
};

/**
 * How a routine's items are ordered, everywhere they are read. position first;
 * createdAt breaks a tie between two items added at the same moment, and id
 * breaks a tie between those, so the order never depends on Postgres's mood.
 */
const TODO_ORDER = [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }];

export const findRoutineById = (id) => {
  return prisma.studyRoutine.findUnique({
    where: { id },
    include: { todoItems: { orderBy: TODO_ORDER } },
  });
};

/**
 * The caller's routines, each with its item count AND how many are done.
 *
 * Two queries rather than one: Prisma's _count can count a relation or a
 * filtered relation, but not both under one name, so the done counts come
 * from a groupBy over the same routines. completedCount is added beside _count
 * rather than replacing it, so a client already reading _count.todoItems keeps
 * working.
 *
 * A routine with nothing done is absent from the groupBy, hence the `?? 0`.
 */
export const findRoutinesByUser = async (userId) => {
  const routines = await prisma.studyRoutine.findMany({
    where: { userId },
    include: { _count: { select: { todoItems: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (routines.length === 0) return routines;

  const done = await prisma.todoItem.groupBy({
    by: ["routineId"],
    where: { routineId: { in: routines.map((r) => r.id) }, isComplete: true },
    _count: { _all: true },
  });
  const doneByRoutine = new Map(done.map((row) => [row.routineId, row._count._all]));

  return routines.map((routine) => ({
    ...routine,
    completedCount: doneByRoutine.get(routine.id) ?? 0,
  }));
};

/**
 * What a NON-owner may see of a routine before cloning it: what they would get.
 *
 * Titles and due dates, because cloneRoutine copies exactly those. NOT
 * isComplete - someone's progress through their own list is theirs, and a
 * clone resets it anyway. The owner is joined with the same three columns
 * follow.repository.js exposes for a user, and nothing else.
 */
export const findRoutinePreview = (id) => {
  return prisma.studyRoutine.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      createdAt: true,
      user: { select: { id: true, username: true, avatarUrl: true } },
      todoItems: {
        orderBy: TODO_ORDER,
        select: { id: true, title: true, dueDate: true },
      },
    },
  });
};

export const updateRoutine = (id, data) => {
  return prisma.studyRoutine.update({ where: { id }, data });
};

export const deleteRoutine = (id) => {
  return prisma.studyRoutine.delete({ where: { id } });
};

export const createTodoItem = ({ routineId, title, dueDate, position }) => {
  return prisma.todoItem.create({
    data: { routineId, title, dueDate: dueDate ?? null, position },
  });
};

/**
 * The slot after the routine's last item, or 0 for an empty routine.
 *
 * Read-then-write, so two adds at the same instant can take the same slot.
 * That is accepted rather than locked against: TODO_ORDER falls back to
 * createdAt, so the pair still lands in a stable order, and the next reorder
 * renumbers everything anyway.
 */
export const findNextTodoPosition = async (routineId) => {
  const { _max } = await prisma.todoItem.aggregate({
    where: { routineId },
    _max: { position: true },
  });
  return _max.position === null ? 0 : _max.position + 1;
};

// bulk insert used by cloning — createMany is one round trip instead of N
export const createTodoItems = (routineId, items) => {
  return prisma.todoItem.createMany({
    data: items.map((item, index) => ({
      routineId,
      title: item.title,
      dueDate: item.dueDate ?? null,
      // Renumbered from 0 in the source's order, so the copy reads the same
      // even if the source's own positions had gaps or ties.
      position: index,
      // deliberately no isComplete here — every clone starts fresh (default: false)
    })),
  });
};

/**
 * Unticks every item in a routine, for starting it again.
 *
 * Only rows that are ticked, so an item already unticked keeps its updatedAt.
 *
 * @returns {Promise<{ count: number }>} how many items changed
 */
export const resetTodoItems = (routineId) => {
  return prisma.todoItem.updateMany({
    where: { routineId, isComplete: true },
    data: { isComplete: false },
  });
};

/**
 * Writes positions 0..n-1 in the order given, all or nothing.
 *
 * The caller has already checked that todoIds is exactly this routine's items
 * - see reorderTodoItems in the service. routineId is in every where clause
 * anyway, so an id from another routine could never be moved even if that
 * check were lost.
 *
 * @param {string} routineId @param {string[]} todoIds
 */
export const setTodoPositions = (routineId, todoIds) => {
  return prisma.$transaction(
    todoIds.map((id, position) =>
      prisma.todoItem.updateMany({ where: { id, routineId }, data: { position } }),
    ),
  );
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
