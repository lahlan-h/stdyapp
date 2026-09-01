import { prisma } from "@stdyapp/core";

export const createGroup = ({ ownerId, name, description, isPrivate, joinCode }) => {
  return prisma.studyGroup.create({
    data: { ownerId, name, description, isPrivate, joinCode },
  });
};

export const findGroupById = (id) => {
  return prisma.studyGroup.findUnique({
    where: { id },
    include: { _count: { select: { memberships: true } } },
  });
};

// search covers both public AND private groups — private groups are
// deliberately still discoverable, joining just requires the code
export const searchGroups = (query) => {
  return prisma.studyGroup.findMany({
    where: query
      ? { name: { contains: query, mode: "insensitive" } }
      : undefined,
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const updateGroup = (id, data) => {
  return prisma.studyGroup.update({ where: { id }, data });
};

// deliberately separate from updateGroup — ownerId should never be settable
// through the generic update path, only through this explicit transfer flow
export const transferOwnership = (id, newOwnerId) => {
  return prisma.studyGroup.update({ where: { id }, data: { ownerId: newOwnerId } });
};

export const deleteGroup = (id) => {
  return prisma.studyGroup.delete({ where: { id } });
};

export const findMembership = (userId, groupId) => {
  return prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
};

export const listMembers = (groupId) => {
  return prisma.groupMembership.findMany({
    where: { groupId },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });
};

export const createMembership = (userId, groupId) => {
  return prisma.groupMembership.create({ data: { userId, groupId } });
};

export const deleteMembership = (userId, groupId) => {
  return prisma.groupMembership.delete({
    where: { userId_groupId: { userId, groupId } },
  });
};

export const setMembershipRole = (userId, groupId, role) => {
  return prisma.groupMembership.update({
    where: { userId_groupId: { userId, groupId } },
    data: { role },
  });
};