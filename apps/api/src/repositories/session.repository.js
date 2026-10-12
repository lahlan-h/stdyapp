import { prisma } from "@stdyapp/core";

export const createSession = ({
  userId,
  groupId,
  inviteCode,
  plannedMinutes = null,
  hostSessionId = null,
}) => {
  return prisma.session.create({
    data: { userId, groupId, inviteCode, plannedMinutes, hostSessionId },
  });
};

export const findSessionById = (id) => {
  return prisma.session.findUnique({
    where: { id },
    include: { interruptions: true },
  });
};

/**
 * The caller's history, newest first.
 *
 * The group's NAME rides along so a history row can say who it was studied
 * with. A rename does not bump the session list's cache counter, so a cached
 * list can show the old name until CACHE_TTL_SESSION_LIST_SEC lapses - a minute
 * of a stale label, which is not worth a cross-module invalidation.
 */
export const findSessionsByUser = (userId) => {
  return prisma.session.findMany({
    where: { userId },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { startedAt: "desc" },
  });
};

/**
 * The session an invite code belongs to. inviteCode is @unique, so this is an
 * index hit rather than a scan.
 */
export const findSessionByInviteCode = (inviteCode) => {
  return prisma.session.findUnique({ where: { inviteCode } });
};

/**
 * Every session the user has not ended, with the latest sign of life from
 * each: its newest focus sample and its newest interruption.
 *
 * Read before starting or joining a session, to tell one genuinely running on
 * another device from one an app crash left open - see settleOpenSessions in
 * session.service.js. A user has at most a handful of these, and take: 1 on
 * each relation rides the [sessionId, timestamp] index.
 */
export const findOpenSessionsByUser = (userId) => {
  return prisma.session.findMany({
    where: { userId, endedAt: null },
    select: {
      id: true,
      groupId: true,
      startedAt: true,
      focusSamples: {
        select: { timestamp: true },
        orderBy: { timestamp: "desc" },
        take: 1,
      },
      interruptions: {
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });
};

/**
 * Everyone still in a room: the room's first session and every session that
 * joined it, unended and inside the live window - the same floor
 * findLiveSessionsByGroup uses, so the two lists never disagree.
 *
 * The newest sample and interruption ride along so the client can tell
 * "studying" from "gone quiet" without a request per person.
 *
 * @param {string} roomId - the room's first session
 * @param {Date} since
 */
export const findRoomSessions = (roomId, since) => {
  return prisma.session.findMany({
    where: {
      OR: [{ id: roomId }, { hostSessionId: roomId }],
      endedAt: null,
      startedAt: { gte: since },
    },
    select: {
      id: true,
      userId: true,
      startedAt: true,
      plannedMinutes: true,
      user: { select: { id: true, username: true, avatarUrl: true } },
      focusSamples: {
        select: { timestamp: true },
        orderBy: { timestamp: "desc" },
        take: 1,
      },
      interruptions: {
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startedAt: "asc" },
  });
};

/**
 * Who joined this session, and who owns each of those rows.
 *
 * Asked by deleteSession BEFORE deleting a host's session, for
 * findSessionRefsByGroup's reason: hostSessionId is ON DELETE SET NULL, so the
 * delete rewrites these rows without passing through the service, and once it
 * has run they are unfindable.
 *
 * @param {string} hostSessionId
 * @returns {Promise<Array<{ id: string, userId: string }>>}
 */
export const findParticipantRefs = (hostSessionId) => {
  return prisma.session.findMany({
    where: { hostSessionId },
    select: { id: true, userId: true },
  });
};

/**
 * Who in a group is studying right now.
 *
 * "Right now" is endedAt NULL AND started after `since`. The second half is
 * what keeps an abandoned session out: an app killed mid-session never sends
 * PATCH /end, and without a floor that row would sit in the group's live list
 * forever.
 *
 * @param {string} groupId
 * @param {Date} since
 */
export const findLiveSessionsByGroup = (groupId, since) => {
  return prisma.session.findMany({
    where: { groupId, endedAt: null, startedAt: { gte: since } },
    select: {
      id: true,
      inviteCode: true,
      hostSessionId: true,
      startedAt: true,
      plannedMinutes: true,
      user: { select: { id: true, username: true, avatarUrl: true } },
    },
    orderBy: { startedAt: "asc" },
  });
};

export const updateSession = (id, data) => {
  return prisma.session.update({ where: { id }, data });
};

export const deleteSession = (id) => {
  return prisma.session.delete({ where: { id } });
};

export const addInterruption = ({ sessionId, durationSec, penaltyApplied, type = null }) => {
  return prisma.sessionInterruption.create({
    data: { sessionId, durationSec, penaltyApplied, type },
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

/**
 * The caller's FINISHED sessions since a moment in time, with what analytics
 * needs from each.
 *
 * A sibling of findCompletedSessionsSince rather than a widening of it. That
 * one feeds goal progress, which runs on the tail of every endSession, and
 * pulling interruptions into it would add a join to the hottest write path in
 * the app for a column goals never read.
 *
 * Rows rather than an aggregate, for the reason findCompletedSessionsSince
 * gives: there is no duration column to sum. The window is bounded by the
 * caller (analytics asks for at most two ranges plus a week of slack), so this
 * is tens to low hundreds of narrow rows.
 *
 * Filtered on startedAt, matching findCompletedSessionsSince: a session
 * belongs to the day it began.
 *
 * @param {string} userId
 * @param {Date} since
 * @returns {Promise<Array<{
 *   startedAt: Date,
 *   endedAt: Date,
 *   focusPoints: number,
 *   groupId: string | null,
 *   interruptions: Array<{ durationSec: number, penaltyApplied: boolean }>,
 * }>>}
 */
export const findCompletedSessionsForAnalytics = (userId, since) => {
  return prisma.session.findMany({
    where: {
      userId,
      endedAt: { not: null },
      startedAt: { gte: since },
    },
    select: {
      startedAt: true,
      endedAt: true,
      focusPoints: true,
      groupId: true,
      interruptions: { select: { durationSec: true, penaltyApplied: true } },
    },
    orderBy: { startedAt: "asc" },
  });
};