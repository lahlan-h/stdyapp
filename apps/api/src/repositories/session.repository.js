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