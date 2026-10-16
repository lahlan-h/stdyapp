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
 * Includes the two relations the history screen summarises - interruptions
 * (count and time away) and the self-rating - narrowed to the one column each
 * that is read. session.service.js folds them into numbers via
 * toSessionHistoryRow, so neither array reaches the response.
 *
 * The group's NAME rides along so a history row can say who it was studied
 * with. A rename does not bump the session list's cache counter, so a cached
 * list can show the old name until CACHE_TTL_SESSION_LIST_SEC lapses - a minute
 * of a stale label, which is not worth a cross-module invalidation.
 */
export const findSessionsByUser = (userId) => {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: {
      group: { select: { id: true, name: true } },
      // type, so a break is not summed as time away - see isTimeAway.
      interruptions: { select: { durationSec: true, type: true } },
      focusRating: { select: { selfRating: true } },
    },
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
 * A session's newest FOREGROUND sample - the one sign of life that means the
 * same thing on every phone.
 *
 * inApp: true is what makes it consistent. iOS suspends a backgrounded app at
 * once, so it sends nothing; Android often keeps the JS timers running for a
 * while and goes on sampling with inApp: false. Counting those would make an
 * Android user who put their phone away look active where an iPhone user in
 * the same moment looks away. Counting only time in the app treats both alike.
 */
const latestForegroundSample = {
  where: { inApp: true },
  select: { timestamp: true },
  orderBy: { timestamp: "desc" },
  take: 1,
};

// The columns lastSignOfLife in session.service.js reads, shared by every
// lookup below so none can judge "alive" differently.
const activitySelect = {
  id: true,
  userId: true,
  groupId: true,
  startedAt: true,
  endedAt: true,
  plannedMinutes: true,
  // A break is a sign of life, and a plan runs late by its breaks.
  pausedAt: true,
  pausedSeconds: true,
  focusSamples: latestForegroundSample,
  interruptions: {
    select: { startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 1,
  },
};

/** One session with its latest sign of life - for abandonSession. */
export const findSessionActivity = (id) => {
  return prisma.session.findUnique({ where: { id }, select: activitySelect });
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
    select: activitySelect,
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
      focusSamples: latestForegroundSample,
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
 * Open sessions old enough that the sweep might close them - anything started
 * more than `startedBefore` ago and never ended. The sweep applies the real
 * rule (see sweepAbandonedSessions); this only keeps the scan to sessions that
 * could possibly qualify, on the startedAt the table is already ordered by.
 *
 * @param {Date} startedBefore
 * @param {string[]} [userIds] - only these users' sessions; every user when absent
 */
export const findSweepCandidates = (startedBefore, userIds) => {
  return prisma.session.findMany({
    where: {
      endedAt: null,
      startedAt: { lt: startedBefore },
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
    select: activitySelect,
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

/**
 * Every open session belonging to these people - ANY session, in any group or
 * none. The group feed's "who's studying" strip, which asks about a group's
 * members rather than its rooms; see services/studyingNow.js.
 *
 * "Open" is findLiveSessionsByGroup's definition exactly - endedAt NULL and
 * started after `since` - so the strip and the group page's "Studying now"
 * never disagree about whether someone is still at it.
 *
 * @param {string[]} userIds
 * @param {Date} since
 */
export const findLiveSessionsByUsers = (userIds, since) => {
  if (userIds.length === 0) return Promise.resolve([]);
  return prisma.session.findMany({
    where: { userId: { in: userIds }, endedAt: null, startedAt: { gte: since } },
    select: {
      id: true,
      userId: true,
      groupId: true,
      startedAt: true,
      plannedMinutes: true,
      // Who is on a break, and how much of their time was one.
      pausedAt: true,
      pausedSeconds: true,
      user: {
        select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
    orderBy: { startedAt: "asc" },
  });
};

/**
 * Starts a break - but only if the session is still running, has no break
 * open and has one left. updateMany for the condition: update() can only
 * match on unique fields, and the condition is the point. Resolves true when
 * this call started it.
 *
 * @param {string} id
 * @param {Date} at
 * @param {number} maxPauses
 */
export const startPause = async (id, at, maxPauses) => {
  const { count } = await prisma.session.updateMany({
    where: { id, endedAt: null, pausedAt: null, pauseCount: { lt: maxPauses } },
    data: { pausedAt: at, pauseCount: { increment: 1 } },
  });
  return count === 1;
};

/**
 * The row a finished break leaves, stamped - like every interruption - at the
 * moment it ended, with the seconds it was credited. Not time away; see BREAK
 * in the Prisma schema.
 */
const breakRow = (sessionId, pausedAt, creditedSeconds) => ({
  sessionId,
  startedAt: new Date(pausedAt.getTime() + creditedSeconds * 1000),
  durationSec: creditedSeconds,
  penaltyApplied: false,
  type: "BREAK",
});

/**
 * Ends a break, crediting its seconds - only if it is still the break that
 * began at `pausedAt`, so a racing second resume cannot credit it twice - and
 * records where it fell, in the same transaction so the two always agree.
 *
 * @param {string} id
 * @param {Date} pausedAt
 * @param {number} creditedSeconds
 */
export const finishPause = (id, pausedAt, creditedSeconds) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id, pausedAt },
      data: { pausedAt: null, pausedSeconds: { increment: creditedSeconds } },
    });
    if (count === 1 && creditedSeconds > 0) {
      await tx.sessionInterruption.create({ data: breakRow(id, pausedAt, creditedSeconds) });
    }
    return count === 1;
  });

/**
 * Writes a session's end, closing a break still open at that moment - its
 * credited share already summed into data.pausedSeconds by the caller - and
 * recording it as a break, together.
 *
 * @param {string} id
 * @param {object} data - endedAt, focusPoints, pausedAt: null, pausedSeconds
 * @param {{ pausedAt: Date, creditedSeconds: number } | null} openBreak
 */
export const closeSessionRow = (id, data, openBreak) =>
  prisma.$transaction(async (tx) => {
    const updated = await tx.session.update({ where: { id }, data });
    if (openBreak && openBreak.creditedSeconds > 0) {
      await tx.sessionInterruption.create({
        data: breakRow(id, openBreak.pausedAt, openBreak.creditedSeconds),
      });
    }
    return updated;
  });

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
    // pausedSeconds: a goal counts studied time, breaks left out.
    select: { startedAt: true, endedAt: true, pausedSeconds: true },
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
 *   focusScore: number | null,
 *   focusWeightedMinutes: number | null,
 *   tasksTotal: number | null,
 *   tasksCompleted: number | null,
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
      // Breaks come off every duration - see sessionPause.js.
      pausedSeconds: true,
      focusPoints: true,
      groupId: true,
      // The focus estimate and checklist totals, as finaliseSessionFocus
      // copied them onto the row - plain columns, so the task table is never
      // joined (see the note on Session.tasksTotal in the Prisma schema).
      focusScore: true,
      focusWeightedMinutes: true,
      tasksTotal: true,
      tasksCompleted: true,
      interruptions: { select: { durationSec: true, penaltyApplied: true, type: true } },
    },
    orderBy: { startedAt: "asc" },
  });
};