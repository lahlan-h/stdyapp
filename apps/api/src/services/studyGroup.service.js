import * as groupRepo from "../repositories/studyGroup.repository.js";

const notFound = () => {
  const err = new Error("Group not found");
  err.status = 404;
  return err;
};

const forbidden = (message = "You don't have permission to do that") => {
  const err = new Error(message);
  err.status = 403;
  return err;
};

const conflict = (message) => {
  const err = new Error(message);
  err.status = 409;
  return err;
};

// Strips joinCode from the response unless the requester is the owner.
// Otherwise "private with a code" is pointless — anyone could just fetch
// the group's details and read the code straight off it.
const sanitizeGroup = (group, requesterId) => {
  if (group.ownerId === requesterId) return group;
  const { joinCode, ...safe } = group;
  return safe;
};

export const createGroup = async ({ ownerId, name, description, isPrivate }) => {
  const joinCode = isPrivate
    ? Math.random().toString(36).slice(2, 8).toUpperCase()
    : null;

  const group = await groupRepo.createGroup({
    ownerId,
    name,
    description: description ?? null,
    isPrivate: !!isPrivate,
    joinCode,
  });

  // the owner is also a member — without this they wouldn't show up in
  // listMembers, and ownership transfer (which requires the new owner to
  // already be a member) would have no way to happen in reverse either
  await groupRepo.createMembership(ownerId, group.id);

  return group;
};

export const getGroup = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  return sanitizeGroup(group, requesterId);
};

// search results are public — private groups are discoverable by design,
// they just can't be joined without the code
export const searchGroups = async (query, requesterId) => {
  const groups = await groupRepo.searchGroups(query);
  return groups.map((g) => sanitizeGroup(g, requesterId));
};

export const updateGroup = async (groupId, requesterId, data) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  const isOwner = group.ownerId === requesterId;
  const membership = await groupRepo.findMembership(requesterId, groupId);
  const isAdmin = membership?.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw forbidden("Only the owner or an admin can update this group");
  }

  const { name, description, isPrivate, joinCode } = data;

  // privacy settings are security-sensitive — only the owner changes them,
  // admins can update the basic info (name/description) only
  if ((isPrivate !== undefined || joinCode !== undefined) && !isOwner) {
    throw forbidden("Only the owner can change privacy settings");
  }

  const updateData = isOwner
    ? { name, description, isPrivate, joinCode }
    : { name, description };

  return groupRepo.updateGroup(groupId, updateData);
};

export const deleteGroup = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  if (group.ownerId !== requesterId) throw forbidden("Only the group owner can delete it");
  return groupRepo.deleteGroup(groupId);
};

export const transferOwnership = async (groupId, requesterId, newOwnerId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  if (group.ownerId !== requesterId) throw forbidden("Only the group owner can transfer ownership");

  if (newOwnerId === requesterId) {
    throw conflict("Already the owner");
  }

  // new owner must already be in the group — prevents handing a group to
  // someone with no context or history in it
  const membership = await groupRepo.findMembership(newOwnerId, groupId);
  if (!membership) {
    throw conflict("New owner must already be a member of the group");
  }

  // the old owner keeps their membership row (they don't get kicked out,
  // they just become a regular member) — no extra cleanup needed here
  return groupRepo.transferOwnership(groupId, newOwnerId);
};

export const joinGroup = async (groupId, userId, providedCode) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  if (group.isPrivate && group.joinCode !== providedCode) {
    throw forbidden("Incorrect join code");
  }

  const existing = await groupRepo.findMembership(userId, groupId);
  if (existing) throw conflict("Already a member of this group");

  return groupRepo.createMembership(userId, groupId);
};

export const leaveGroup = async (groupId, userId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  // an owner leaving their own group would orphan it — they need to either
  // delete it or (future feature) transfer ownership first
  if (group.ownerId === userId) {
    throw conflict("Group owner can't leave — delete the group instead");
  }

  const existing = await groupRepo.findMembership(userId, groupId);
  if (!existing) throw notFound();

  return groupRepo.deleteMembership(userId, groupId);
};

export const listMembers = async (groupId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  return groupRepo.listMembers(groupId);
};

// owner can kick anyone (member or admin); an admin can only kick regular
// members, never another admin or the owner — prevents admin infighting
export const kickMember = async (groupId, requesterId, targetUserId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  if (targetUserId === group.ownerId) {
    throw conflict("Can't remove the group owner");
  }

  const isOwner = group.ownerId === requesterId;
  const requesterMembership = await groupRepo.findMembership(requesterId, groupId);
  const isAdmin = requesterMembership?.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw forbidden("Only the owner or an admin can remove members");
  }

  const targetMembership = await groupRepo.findMembership(targetUserId, groupId);
  if (!targetMembership) throw notFound();

  if (!isOwner && targetMembership.role === "ADMIN") {
    throw forbidden("Only the owner can remove an admin");
  }

  return groupRepo.deleteMembership(targetUserId, groupId);
};

// promoting/demoting admins is owner-only — prevents admins from granting
// themselves or each other more power
export const setMemberRole = async (groupId, requesterId, targetUserId, role) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  if (group.ownerId !== requesterId) {
    throw forbidden("Only the owner can change member roles");
  }

  if (targetUserId === group.ownerId) {
    throw conflict("The owner's role can't be changed — transfer ownership instead");
  }

  if (!["MEMBER", "ADMIN"].includes(role)) {
    const err = new Error("role must be MEMBER or ADMIN");
    err.status = 400;
    throw err;
  }

  const membership = await groupRepo.findMembership(targetUserId, groupId);
  if (!membership) throw notFound();

  return groupRepo.setMembershipRole(targetUserId, groupId, role);
};