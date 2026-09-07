import * as groupRepo from "../repositories/studyGroup.repository.js";
// Deleting a group nulls sessions.groupId via ON DELETE SET NULL — a write to
// sessions that never passes through session.service.js, so its cache has to be
// told. The same shape post.service.js/session.service.js already use for posts.
import { findSessionRefsByGroup } from "../repositories/session.repository.js";
import { invalidateDetachedSessions } from "./session.service.js";
import {
  bumpVersions,
  groupContentVersionKey,
  groupMemberVersionKey,
} from "../utils/cache.js";

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

/**
 * Invalidates this module's cached reads.
 *
 * Two scopes rather than the entity/owner split posts and sessions use, because
 * a group is read by its members rather than listed by its owner:
 *
 *   content - GET /:id, the group row itself
 *   members - GET /:id/members, AND GET /:id again, because findGroupById
 *             includes _count.memberships
 *
 * That second clause is the easy one to get wrong: a join changes the group
 * payload without touching the study_groups row at all, so every membership
 * write has to bump `members` and groupKey has to be stamped with it. It is.
 *
 * Nothing here can fail a write — bumpVersions swallows its own Redis errors.
 * Awaited rather than fired and forgotten, so a client reading straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {{ groupId: string, content?: boolean, members?: boolean }} scope
 */
const invalidateGroup = async ({ groupId, content = false, members = false }) => {
  const keys = [];
  if (content) keys.push(groupContentVersionKey(groupId));
  if (members) keys.push(groupMemberVersionKey(groupId));

  await bumpVersions(keys);
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

  // No invalidation, and that is not an omission. Both counters for this group
  // are brand new and read as 0, and nothing can hold a cached payload under a
  // group id that did not exist a moment ago. Bumping here would orphan
  // nothing. Contrast startSession, which DOES bump: a new session lands in a
  // cached LIST, whereas GET /api/groups (search) is deliberately uncached.
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

  const updated = await groupRepo.updateGroup(groupId, updateData);

  // AFTER the write resolves — bumping first lets a reader observe the new
  // version, query the not-yet-committed row and cache the OLD body under the
  // NEW key. CONTENT only: no membership row is touched here.
  await invalidateGroup({ groupId, content: true });

  return updated;
};

export const deleteGroup = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  if (group.ownerId !== requesterId) throw forbidden("Only the group owner can delete it");

  // Read BEFORE the delete: afterwards groupId is already NULL on every one of
  // these rows and there is no way left to find which sessions were detached.
  // Identical in shape to deleteSession's findPostRefsBySession call.
  const detached = await findSessionRefsByGroup(groupId);

  const result = await groupRepo.deleteGroup(groupId);

  // BOTH scopes: the group is gone, and its memberships went with it via
  // ON DELETE CASCADE. Then the sessions this just detached, which live in
  // another module's cache and can only be invalidated from there.
  await invalidateGroup({ groupId, content: true, members: true });
  await invalidateDetachedSessions(detached);

  return result;
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
  const updated = await groupRepo.transferOwnership(groupId, newOwnerId);

  // CONTENT only — no membership row changes, so the member list and the count
  // are both untouched. Load-bearing rather than cosmetic: ownerId is what
  // sanitizeGroup tests, so a stale content payload would keep showing the
  // joinCode to the PREVIOUS owner and keep hiding it from the new one.
  await invalidateGroup({ groupId, content: true });

  return updated;
};

export const joinGroup = async (groupId, userId, providedCode) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  if (group.isPrivate && group.joinCode !== providedCode) {
    throw forbidden("Incorrect join code");
  }

  const existing = await groupRepo.findMembership(userId, groupId);
  if (existing) throw conflict("Already a member of this group");

  const membership = await groupRepo.createMembership(userId, groupId);

  // MEMBERS only. That single bump covers the member list AND the group
  // payload, because groupKey is stamped with this counter too — see the note
  // above invalidateGroup. The group row itself did not change, so bumping
  // content as well would throw away a good cache entry for nothing.
  await invalidateGroup({ groupId, members: true });

  return membership;
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

  const result = await groupRepo.deleteMembership(userId, groupId);

  await invalidateGroup({ groupId, members: true });

  return result;
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

  const result = await groupRepo.deleteMembership(targetUserId, groupId);

  await invalidateGroup({ groupId, members: true });

  return result;
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

  const updated = await groupRepo.setMembershipRole(targetUserId, groupId, role);

  // MEMBERS only, and this is the write that justifies the two-counter split.
  // A role change alters neither the group row nor the membership COUNT, so the
  // group payload is still perfectly valid — only the member list has moved.
  await invalidateGroup({ groupId, members: true });

  return updated;
};