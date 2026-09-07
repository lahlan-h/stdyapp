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
