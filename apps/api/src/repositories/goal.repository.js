import { prisma } from "@stdyapp/core";

/**
 * Every function here is scoped by userId rather than by goal id, and that is
 * the point rather than an omission.
 *
 * @@unique([userId, period]) means the pair identifies a row completely, so
 * there is no findGoalById and nothing that could be handed a goal belonging to
 * someone else. The WHERE clause IS the authorisation, the property
 * deleteMyFollows relies on in follow.service.js - which is why there is no
 * getOwnedGoalOrThrow in goal.service.js and why none is needed.
 */

/**
 * Sets a target, creating the goal if this is the first time.
 *
 * upsert rather than create-then-update, and not merely for tidiness: two
 * concurrent PUTs from a double-tapped Save would race between the read and the
 * write, and the loser would hit the unique constraint and 409 on a request
 * that should plainly succeed. upsert pushes that whole decision into one
 * statement Postgres resolves under the constraint itself.
 *
 * `userId_period` is Prisma's generated name for the compound unique - it is
 * the field list joined by underscores, not something chosen here.
 */
export const upsertGoal = ({ userId, period, targetMinutes }) => {
  return prisma.goal.upsert({
    where: { userId_period: { userId, period } },
    create: { userId, period, targetMinutes },
    update: { targetMinutes },
  });
};

// Ordered by period so DAILY precedes WEEKLY - alphabetical here happens to be
// shortest-first, which is the order a client would render them in anyway.
export const findGoalsByUser = (userId) => {
  return prisma.goal.findMany({
    where: { userId },
    orderBy: { period: "asc" },
  });
};

export const findGoalByPeriod = (userId, period) => {
  return prisma.goal.findUnique({
    where: { userId_period: { userId, period } },
  });
};

/**
 * Clears a target.
 *
 * deleteMany rather than delete, for the reason deleteLikeByUserAndPost gives
 * in like.repository.js: it does not throw when nothing matches. A client
 * clearing a goal it has already cleared - a double tap, or a retry after a
 * dropped response - gets the same 204 instead of a P2025 that the error
 * middleware would render as a 500.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteGoalByPeriod = (userId, period) => {
  return prisma.goal.deleteMany({ where: { userId, period } });
};
