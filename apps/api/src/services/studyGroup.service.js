import * as groupRepo from "../repositories/studyGroup.repository.js";
// Deleting a group nulls sessions.groupId via ON DELETE SET NULL — a write to
// sessions that never passes through session.service.js, so its cache has to be
// told. The same shape post.service.js/session.service.js already use for posts.
import {
  findSessionRefsByGroup,
  findLiveSessionsByGroup,
  findLiveSessionsByUsers,
} from "../repositories/session.repository.js";
// Both directions of the block relation - the leaderboard's own read, reused
// rather than written a second time for the same social-surface rule.
import { findBlockedUserIds } from "../repositories/focus.repository.js";
import { toStudyingNow } from "./studyingNow.js";
import {
  invalidateDetachedSessions,
  LIVE_SESSION_WINDOW_MS,
} from "./session.service.js";
import { notifyActivity } from "./notification.service.js";
import { generateJoinCode, normalizeJoinCode } from "./joinCode.js";
import { isPrismaError } from "../utils/prismaError.js";
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

// Strips joinCode from the response unless the requester is in the group.
// The code is how a group is joined, so it is for the people already in it
// to pass on - anyone else reading it off GET /:id or a search result would
// make every group, private ones included, open to whoever looked.
const sanitizeGroup = (group, isMember) => {
  if (isMember) return group;
  const { joinCode, ...safe } = group;
  return safe;
};

/**
 * What the viewer is to this group, in the three fields a client needs.
 *
 * `memberships` arrives filtered to the viewer (see viewerInclude in the
 * repository), so it is empty or one row - and it is dropped here so no list
 * response ever looks like a member list.
 */
const withViewer = ({ memberships, ...group }, requesterId) => ({
  ...sanitizeGroup(group, memberships.length > 0),
  isMember: memberships.length > 0,
  isOwner: group.ownerId === requesterId,
  role: memberships[0]?.role ?? null,
});

/**
 * How many fresh codes to try before giving up on a write. A collision is a
 * one-in-a-billion event per existing group (see joinCode.js), so a second try
 * is already belt and braces; five is there for a far fuller table than this.
 */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Runs a write that sets a newly generated join code, retrying with another
 * code if the unique index says this one is taken. Codes are generated rather
 * than checked first, because a check-then-write could lose a race to another
 * group taking the same code in between; the index is the only real referee.
 *
 * @template T
 * @param {(joinCode: string) => Promise<T>} write
 * @returns {Promise<T>}
 */
const withFreshCode = async (write) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write(generateJoinCode());
    } catch (err) {
      const codeTaken =
        isPrismaError(err, "P2002") && String(err.meta?.target ?? "").includes("joinCode");
      if (!codeTaken || attempt >= MAX_CODE_ATTEMPTS) throw err;
    }
  }
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

/**
 * Every group gets a code, public or private: it is how anyone joins, typed on
 * the Study tab. A private group differs only in having no other way in.
 */
export const createGroup = async ({ ownerId, name, description, isPrivate }) => {
  const group = await withFreshCode((joinCode) =>
    groupRepo.createGroup({
      ownerId,
      name,
      description: description ?? null,
      isPrivate: !!isPrivate,
      joinCode,
    }),
  );

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

/**
 * One group, with the viewer's standing in it.
 *
 * Safe to cache as it is: GET /:id is keyed on the viewer AND stamped with the
 * member counter, so a join or leave - which is what changes isMember - already
 * orphans this payload.
 */
export const getGroup = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  const membership = await groupRepo.findMembership(requesterId, groupId);
  return withViewer(
    { ...group, memberships: membership ? [membership] : [] },
    requesterId,
  );
};

/**
 * Joins whichever group a code belongs to - the Study tab's "Join a group".
 *
 * The code IS the key, for public and private groups alike: holding it is the
 * proof that someone in the group meant you to have it. So unlike joinGroup
 * there is no separate privacy check - a private group's code was always what
 * let you in.
 *
 * 404 for a code no group has; 409 for a group you are already in, carrying
 * its id so the client can simply open it - typing your own group's code is
 * not really an error, just a short trip.
 *
 * @param {string} userId
 * @param {string} rawCode - as typed; normalised here
 */
export const joinGroupByCode = async (userId, rawCode) => {
  const group = await groupRepo.findGroupByJoinCode(normalizeJoinCode(rawCode));
  if (!group) {
    const err = new Error("No group has that code. Check it and try again.");
    err.status = 404;
    throw err;
  }

  const existing = await groupRepo.findMembership(userId, group.id);
  if (existing) {
    const err = conflict("You're already in this group");
    // Rendered into the error body by index.js, as joinSession's groupId is.
    err.data = { groupId: group.id };
    throw err;
  }

  await addMember(group, userId);
  return getGroup(group.id, userId);
};

// search results are public — private groups are discoverable by design,
// they just can't be joined without the code
export const searchGroups = async ({ q, page, limit }, requesterId) => {
  const [groups, total] = await groupRepo.searchGroups({ q, page, limit }, requesterId);
  return {
    items: groups.map((g) => withViewer(g, requesterId)),
    total,
    page,
    limit,
  };
};

export const listMyGroups = async (userId) => {
  const groups = await groupRepo.findGroupsByMember(userId);
  return groups.map((g) => withViewer(g, userId));
};

/**
 * Who in the group is studying right now, with the invite code to join each.
 *
 * Members only. The codes are what make that matter: they are meant for people
 * already in the room, and joinSession checks membership again regardless.
 */
export const listLiveSessions = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  const membership = await groupRepo.findMembership(requesterId, groupId);
  if (!membership) throw forbidden("Only members can see who's studying");

  const sessions = await findLiveSessionsByGroup(
    groupId,
    new Date(Date.now() - LIVE_SESSION_WINDOW_MS),
  );

  // isMine so a client can leave its own session out of "join someone" without
  // having to know its own user id.
  return sessions.map((session) => ({
    ...session,
    isMine: session.user.id === requesterId,
  }));
};

/**
 * Which members are studying right now, in any session - the group feed's
 * live strip. See studyingNow.js for why "any" rather than this group's.
 *
 * Members only, like the live sessions above. Anyone with a block between them
 * and the viewer is left out, as on every other social surface.
 */
export const listStudyingMembers = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  const membership = await groupRepo.findMembership(requesterId, groupId);
  if (!membership) throw forbidden("Only members can see who's studying");

  const [memberIds, blocked] = await Promise.all([
    groupRepo.findMemberIds(groupId),
    findBlockedUserIds(requesterId),
  ]);
  const hidden = new Set(blocked);

  const sessions = await findLiveSessionsByUsers(
    memberIds.filter((id) => !hidden.has(id)),
    new Date(Date.now() - LIVE_SESSION_WINDOW_MS),
  );

  return toStudyingNow(sessions, { groupId, viewerId: requesterId });
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

  const { name, description, isPrivate } = data;

  // privacy settings are security-sensitive — only the owner changes them,
  // admins can update the basic info (name/description) only
  if (isPrivate !== undefined && !isOwner) {
    throw forbidden("Only the owner can change privacy settings");
  }

  // The join code is not here, and going private or public leaves it alone:
  // every group has one either way, and it is only ever replaced by
  // regenerateJoinCode - never set to a value someone chose.
  const updateData = isOwner ? { name, description, isPrivate } : { name, description };

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

/**
 * A fresh join code, generated here rather than chosen by the owner, and the
 * way to retire a code that has leaked. Existing members are unaffected; only
 * new joins need it. Any group's, now that every group has one.
 */
export const regenerateJoinCode = async (groupId, requesterId) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();
  if (group.ownerId !== requesterId) throw forbidden("Only the owner can change the join code");

  const updated = await withFreshCode((joinCode) =>
    groupRepo.updateGroup(groupId, { joinCode }),
  );

  // CONTENT only: the code is part of every member's GET /:id payload.
  await invalidateGroup({ groupId, content: true });

  return updated;
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
  // isOwner reads, so a stale content payload would keep offering the owner's
  // controls - delete, a new code - to the PREVIOUS owner, and not the new one.
  await invalidateGroup({ groupId, content: true });

  return updated;
};

/**
 * The membership write shared by both ways in - joining from the group's own
 * screen and joining by code - so the cache and the owner's notification can
 * never differ between them.
 */
const addMember = async (group, userId) => {
  const membership = await groupRepo.createMembership(userId, group.id);

  // MEMBERS only. That single bump covers the member list AND the group
  // payload, because groupKey is stamped with this counter too — see the note
  // above invalidateGroup. The group row itself did not change, so bumping
  // content as well would throw away a good cache entry for nothing.
  await invalidateGroup({ groupId: group.id, members: true });

  // To the owner only, not every member: a group's owner is the one who wants to
  // know who arrived, and fanning out to a large group would turn every join
  // into a broadcast. Not awaited - see notifyActivity.
  void notifyActivity({
    recipientId: group.ownerId,
    actorId: userId,
    type: "GROUP_JOIN",
    describe: (name) => `${name} joined your group “${group.name}”.`,
  });

  return membership;
};

export const joinGroup = async (groupId, userId, providedCode) => {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) throw notFound();

  // Case and spacing forgiven, as joinGroupByCode forgives them - see
  // normalizeJoinCode for why that widens nothing a guesser can use.
  if (group.isPrivate && group.joinCode !== normalizeJoinCode(providedCode ?? "")) {
    throw forbidden("Incorrect join code");
  }

  const existing = await groupRepo.findMembership(userId, groupId);
  if (existing) throw conflict("Already a member of this group");

  return addMember(group, userId);
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