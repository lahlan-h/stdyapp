import { prisma } from "@stdyapp/core";

export const createSession = ({ userId, groupId, inviteCode }) => {
  return prisma.session.create({
    data: { userId, groupId, inviteCode },
  });
};

export const findSessionById = (id) => {
  return prisma.session.findUnique({
    where: { id },
    include: { interruptions: true },
  });
};

export const findSessionsByUser = (userId) => {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
  });
};

export const updateSession = (id, data) => {
  return prisma.session.update({ where: { id }, data });
};

export const deleteSession = (id) => {
  return prisma.session.delete({ where: { id } });
};

export const addInterruption = ({ sessionId, durationSec, penaltyApplied }) => {
  return prisma.sessionInterruption.create({
    data: { sessionId, durationSec, penaltyApplied },
  });
};

/**
 * Which sessions point at this group, and who owns them?
 *
 * Asked by studyGroup.service.js immediately BEFORE deleting a group. Sessions
 * take ON DELETE SET NULL on groupId, so the delete rewrites every one of these
 * rows without ever passing through session.service.js - and once it has run,
 * groupId is already NULL and there is no way left to find which sessions were
 * touched. The read must come first.
 *
 * The same read-before-delete shape as findPostRefsBySession in
 * post.repository.js, and named to match it. userId comes back alongside the id
 * because invalidating a session means bumping its owner's list counter too,
 * and the owner is not otherwise knowable from the group.
 *
 * @param {string} groupId
 * @returns {Promise<Array<{ id: string, userId: string }>>}
 */
export const findSessionRefsByGroup = (groupId) => {
  return prisma.session.findMany({
    where: { groupId },
    select: { id: true, userId: true },
  });
};

/**
 * The caller's FINISHED sessions since a moment in time.
 *
 * Read by goal.service.js to work out how much of a target has been met. It
 * lives here rather than in goal.repository.js because it queries the sessions
 * table, following the placement findPostRefsByRoutine established: a
 * cross-table read belongs to the repository of the table it reads, not the
 * feature that wants it.
 *
 * ⚠ RETURNS ROWS, NOT A SUM, and that is a compromise worth understanding
 * before anyone "optimises" it. Session stores startedAt and endedAt but no
 * duration column, so the thing to add up is a computed difference - which
 * Prisma's aggregate() cannot express and which would otherwise need raw SQL.
 * Summing a narrow projection in JavaScript keeps the query builder honest at
 * the cost of transferring one small row per session in the window.
 *
 * That cost is bounded by the window (a day or a week) and by the fact that a
 * session is a human sitting down to study, so a heavy user produces tens of
 * rows rather than thousands. The real fix is a durationSec column written by
 * endSession, which would make this a one-line aggregate - worth doing when
 * anything else needs to total study time.
 *
 * endedAt: { not: null } is what makes these FINISHED sessions. A running
 * session has no duration yet, and counting it as zero would be a lie that
 * flickers to the truth the moment it ends.
 *
 * @param {string} userId
 * @param {Date} since
 * @returns {Promise<Array<{ startedAt: Date, endedAt: Date }>>}
 */
export const findCompletedSessionsSince = (userId, since) => {
  return prisma.session.findMany({
    where: {
      userId,
      endedAt: { not: null },
      // Filtered on startedAt rather than endedAt so a session that began
      // before the window and finished inside it counts in full, which is how a
      // person would describe it: the study happened, and it happened today.
      startedAt: { gte: since },
    },
    select: { startedAt: true, endedAt: true },
  });
};
