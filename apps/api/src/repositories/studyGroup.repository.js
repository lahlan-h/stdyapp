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

// The group a join code names. Unique, so at most one - and the lookup is the
// unique index itself.
export const findGroupByJoinCode = (joinCode) => {
  return prisma.studyGroup.findUnique({
    where: { joinCode },
    include: { _count: { select: { memberships: true } } },
  });
};

// The viewer's own membership row, at most one, so a list can say "joined"
// without a query per group. Filtered to the viewer: the full membership list
// is GET /:id/members, not something every search result should carry.
const viewerInclude = (viewerId) => ({
  _count: { select: { memberships: true } },
  memberships: { where: { userId: viewerId }, select: { role: true } },
});

// search covers both public AND private groups — private groups are
// deliberately still discoverable, joining just requires the code.
//
// One page plus the total, in one transaction so the two agree - the shape
// and the reasoning of listUsers in user.service.js. The id tiebreak keeps
// pages stable when two groups share a createdAt.
export const searchGroups = ({ q, page, limit }, viewerId) => {
  const where = q ? { name: { contains: q, mode: "insensitive" } } : undefined;

  return prisma.$transaction([
    prisma.studyGroup.findMany({
      where,
      include: viewerInclude(viewerId),
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.studyGroup.count({ where }),
  ]);
};

// The groups the viewer belongs to, owned ones included - createGroup makes
// the owner a member.
export const findGroupsByMember = (userId) => {
  return prisma.studyGroup.findMany({
    where: { memberships: { some: { userId } } },
    include: viewerInclude(userId),
    orderBy: { name: "asc" },
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

// Which of these groups the user belongs to - one query for a post's whole
// list of groups to share to, rather than a membership read per group.
export const findMemberGroupIds = async (userId, groupIds) => {
  if (groupIds.length === 0) return [];
  const rows = await prisma.groupMembership.findMany({
    where: { userId, groupId: { in: groupIds } },
    select: { groupId: true },
  });
  return rows.map((row) => row.groupId);
};

// A member's posts leave the group's feed with them - see PostGroupShare.
// Returns how many shares went, so the caller knows whether anything changed.
export const deleteSharesOfMember = async (userId, groupId) => {
  const { count } = await prisma.postGroupShare.deleteMany({
    where: { groupId, post: { userId } },
  });
  return count;
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

// Just the members' ids - the group feed's author list. listMembers would join
// a user row per member for columns the feed never reads.
export const findMemberIds = async (groupId) => {
  const rows = await prisma.groupMembership.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
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