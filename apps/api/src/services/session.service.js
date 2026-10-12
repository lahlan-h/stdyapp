import { createLogger } from "@stdyapp/core";

import * as sessionRepo from "../repositories/session.repository.js";
import { findMembership, findGroupById } from "../repositories/studyGroup.repository.js";
import * as focusService from "./focus.service.js";
// joinSession adds the caller to a PUBLIC group on the way in, and joinGroup
// carries the rules for that - the duplicate check, the owner's notification,
// the member-cache bump. A service import for the reason the gamification
// imports below give.
//
// This closes an import cycle (studyGroup.service.js imports this file), which
// is safe because neither module touches the other's exports until a function
// runs - never at load time. Keep it that way.
import { joinGroup } from "./studyGroup.service.js";
// Gamification, hung off the end of endSession. Service imports rather than
// repository ones, unlike the cross-domain reads elsewhere in this file: these
// carry real rules - the consecutive-day test, the goal-crossing test - and
// reaching past them into a repository would mean re-deriving both here.
import { recordStudyDay } from "./streak.service.js";
import { notifyGoalsReached } from "./goal.service.js";
// Deleting a session nulls posts.sessionId via ON DELETE SET NULL — a write to
// posts that never passes through post.service.js, so its cache has to be told.
import { findPostRefsBySession } from "../repositories/post.repository.js";
import { invalidateDetachedPosts } from "./post.service.js";
// Room changes ride the notification socket's per-user channel, as direct
// messages do - see announceRoom.
import { publishNotificationEvent } from "../realtime/notificationBus.js";
import {
  bumpVersions,
  sessionContentVersionKey,
  sessionOwnerVersionKey,
} from "../utils/cache.js";

// 20+ minutes away applies the focus-point penalty and breaks the streak
const INTERRUPTION_PENALTY_THRESHOLD_SEC = 20 * 60;
const FOCUS_POINTS_PER_MINUTE = 1;
const INTERRUPTION_PENALTY_POINTS = 10;

/**
 * How far back a session with no endedAt still counts as running. An app
 * killed mid-session never ends its row, so without a floor it would read as
 * running for good. Twelve hours outlasts any real sitting.
 *
 * Exported because studyGroup.service.js uses the same window for "studying
 * now": a session must not be live in one place and abandoned in the other.
 */
export const LIVE_SESSION_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * How long an open session may go without a sign of life before starting or
 * joining another one closes it as abandoned.
 *
 * The app posts a focus sample every 15 seconds while a session runs, so five
 * minutes of silence is twenty missed samples - a crashed or killed app, not a
 * slow network. Anything livelier is treated as running on another device.
 */
const ABANDONED_AFTER_MS = 5 * 60 * 1000;

const log = createLogger("sessions");

const notFound = () => {
  const err = new Error("Session not found");
  err.status = 404;
  return err;
};

const forbidden = () => {
  const err = new Error("You don't have access to this session");
  err.status = 403;
  return err;
};

const notAMember = () => {
  const err = new Error("You can only start a group session in a group you've joined");
  err.status = 403;
  return err;
};

// throws if the session doesn't exist or doesn't belong to userId —
// every other function in this file should route through this first
const getOwnedSessionOrThrow = async (sessionId, userId) => {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) throw notFound();
  if (session.userId !== userId) throw forbidden();
  return session;
};

/**
 * Invalidates this module's cached reads.
 *
 * Lives in the service rather than the middleware for the reason
 * post.service.js gives: this is the layer that knows both which session a
 * change touched and whose list it belongs to. Nothing here can fail a write —
 * bumpVersions swallows its own Redis errors, so an outage costs a bump and
 * leaves entries stale until their TTL lapses rather than turning a successful
 * 201 into a 500.
 *
 * Awaited, never fired and forgotten, so a client that reads straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {{ sessionIds?: string[], ownerIds?: string[] }} scope
 */
const invalidateSession = async ({ sessionIds = [], ownerIds = [] }) => {
  await bumpVersions([
    ...sessionIds.map(sessionContentVersionKey),
    ...ownerIds.map(sessionOwnerVersionKey),
  ]);
};

/**
 * The sessions a GROUP delete just detached — called from studyGroup.service.js.
 *
 * Exported for the reason post.service.js exports invalidateDetachedPosts:
 * sessions.groupId is ON DELETE SET NULL, so deleting a group rewrites rows in
 * THIS module's table without any code here running. Nothing else can bump the
 * counters, because nothing else knows the cache layout for sessions.
 *
 * Both scopes are bumped. The group is part of a Session row, so the single-
 * session payload changes, and so does every owner's list that contains one.
 * The refs come from findSessionRefsByGroup, which MUST be read before the
 * delete — afterwards groupId is already NULL and the rows are unfindable.
 *
 * @param {Array<{ id: string, userId: string }>} refs
 */
export const invalidateDetachedSessions = async (refs) => {
  if (refs.length === 0) return;

  await invalidateSession({
    sessionIds: refs.map((ref) => ref.id),
    // Deliberately not de-duplicated here: bumpVersions builds a Set, so a user
    // owning several detached sessions still costs one bump.
    ownerIds: refs.map((ref) => ref.userId),
  });
};

/**
 * Tells everyone still in a room that its line-up changed.
 *
 * A CHANGE, not the list - the notification socket's rule. Each client reads
 * GET /api/sessions/:id/room when it hears this, so a dropped event costs a
 * moment of staleness and never a wrong list. Namespaced `room:` so a client
 * routing on `type` cannot mistake it for a notification.
 *
 * Sent to the room's OPEN sessions only: whoever just left has no list on
 * screen to update. NEVER THROWS - it runs after a write that has committed,
 * and failing to announce is no reason to fail the write.
 *
 * @param {string} roomId - the room's first session
 */
const announceRoom = async (roomId) => {
  try {
    const sessions = await sessionRepo.findRoomSessions(
      roomId,
      new Date(Date.now() - LIVE_SESSION_WINDOW_MS),
    );
    const userIds = [...new Set(sessions.map((session) => session.userId))];
    await Promise.all(
      userIds.map((id) => publishNotificationEvent(id, { type: "room:updated", roomId })),
    );
  } catch (err) {
    log.warn(`room announcement failed for ${roomId}: ${err?.message}`);
  }
};

/**
 * Ends a session at a given moment: banks the points, scores the focus
 * estimate, and invalidates the cache. Shared by endSession, which closes at
 * NOW, and settleOpenSessions, which closes an abandoned session at its last
 * sign of life - so a crash never earns credit for the hours after it.
 *
 * Gamification is deliberately NOT in here; see endSession.
 */
const closeSession = async (session, endedAt) => {
  const minutesStudied = Math.max(
    0,
    Math.round((endedAt - session.startedAt) / 60000)
  );

  const penaltyPoints = session.interruptions
    .filter((i) => i.penaltyApplied)
    .length * INTERRUPTION_PENALTY_POINTS;

  const focusPoints = Math.max(
    0,
    minutesStudied * FOCUS_POINTS_PER_MINUTE - penaltyPoints
  );

  const updated = await sessionRepo.updateSession(session.id, { endedAt, focusPoints });

  /**
   * The focus ESTIMATE: a separate, calibrated 0-100 score derived from this
   * session's focus samples. It writes only the focus* columns and never
   * touches focusPoints above — the two numbers answer different questions.
   * It reads endedAt back from the row, so an abandoned session is scored over
   * the time it actually ran.
   *
   * BEFORE invalidateSession, so the single invalidation below covers this
   * write too rather than leaving a cached row without its score.
   *
   * NON-FATAL, for exactly the reason endSession's gamification block gives:
   * the session has ended and the points are banked, so a failure here must
   * not turn a successful request into a 500 that tells the user their session
   * did not save.
   */
  let focus = null;
  try {
    focus = await focusService.finaliseSessionFocus(session.id, session.userId);
  } catch (err) {
    log.warn(`focus estimate failed for session ${session.id}: ${err?.message}`);
  }

  // AFTER the write resolves, never before or concurrently — bumping first lets
  // a reader observe the new version, query the not-yet-committed row, and cache
  // the OLD body under the NEW key, where it would sit for the full TTL.
  //
  // Both scopes: endedAt and focusPoints appear in the single-session payload
  // and in every row of findSessionsByUser.
  await invalidateSession({ sessionIds: [session.id], ownerIds: [session.userId] });

  // A group session leaving its room - the host's own room included, which is
  // a room the moment anyone joins it. Solo sessions have no room to tell.
  if (session.groupId) await announceRoom(session.hostSessionId ?? session.id);

  return { updated, focus, minutesStudied };
};

/** The newest moment an open session showed it was still being used. */
const lastSignOfLife = (session) =>
  new Date(
    Math.max(
      session.startedAt.getTime(),
      session.focusSamples[0]?.timestamp.getTime() ?? 0,
      session.interruptions[0]?.startedAt.getTime() ?? 0,
    ),
  );

/**
 * Closes the user's ABANDONED sessions and returns the ones still running.
 *
 * The app runs one session at a time, so a user starting or joining a session
 * while an old one is still open almost always means the old one was left
 * behind by a crash or a killed app. Refusing them over it - which joinSession
 * used to do, for up to twelve hours - punished the user for the app dying.
 *
 * Abandoned means silent for ABANDONED_AFTER_MS. Those are closed at their last
 * sign of life, so the time after the crash earns nothing. A session that is
 * NOT silent is genuinely running, most likely on another device, and is left
 * alone - closing it would pull a live session out from under its user.
 *
 * Streaks and goals are not touched for a session closed this way: they are
 * keyed to TODAY, and the abandoned session may have been yesterday's.
 *
 * Each close is non-fatal. This is housekeeping on the way to the session the
 * user actually asked for, and must never be the reason that one fails.
 */
const settleOpenSessions = async (userId) => {
  const open = await sessionRepo.findOpenSessionsByUser(userId);
  const running = [];

  for (const session of open) {
    const last = lastSignOfLife(session);
    if (Date.now() - last.getTime() < ABANDONED_AFTER_MS) {
      running.push(session);
      continue;
    }

    try {
      // Re-read with its interruptions, which closeSession needs for penalties.
      const full = await sessionRepo.findSessionById(session.id);
      if (full && !full.endedAt) await closeSession(full, last);
    } catch (err) {
      log.warn(`could not close abandoned session ${session.id}: ${err?.message}`);
    }
  }

  return running;
};

/**
 * Creates the row. The membership rule and the invite code live here so start
 * and join cannot drift apart on either.
 */
const openSession = async ({ userId, groupId, plannedMinutes = null, hostSessionId = null }) => {
  // A group session counts towards that group - its stats, and later its
  // leaderboard - so only a member may start one. Without this, anyone who
  // knew a group's id could attach sessions to it.
  //
  // Owners pass too: createGroup adds the owner as a member.
  //
  // A groupId that does not exist also lands here, as a 403 rather than the
  // foreign-key failure (a 500) it used to become at the insert below.
  if (groupId) {
    const membership = await findMembership(userId, groupId);
    if (!membership) throw notAMember();
  }

  // invite codes only make sense for group sessions — solo sessions get none.
  // Participants get their own too, so a room can be joined through anyone in
  // it - joinSession resolves every code to the room's host.
  const inviteCode = groupId
    ? Math.random().toString(36).slice(2, 8).toUpperCase()
    : null;

  const session = await sessionRepo.createSession({
    userId,
    groupId,
    inviteCode,
    plannedMinutes,
    hostSessionId,
  });

  // Only the OWNER scope. A brand new session has no cached single-session
  // payload to orphan — nobody can have read an id that did not exist — but it
  // belongs in the caller's list, which someone may well have cached a moment
  // ago.
  await invalidateSession({ ownerIds: [userId] });

  return session;
};

export const startSession = async ({ userId, groupId, plannedMinutes = null }) => {
  // Housekeeping only - a start never refuses over another open session, as it
  // never has. Guarded so a failure here cannot cost the user this session.
  try {
    await settleOpenSessions(userId);
  } catch (err) {
    log.warn(`settling open sessions failed for user ${userId}: ${err?.message}`);
  }

  return openSession({ userId, groupId, plannedMinutes });
};

/**
 * Joins someone else's running group session by its invite code.
 *
 * A Session row belongs to ONE user - its clock, samples and score are theirs -
 * so joining does not add the caller to the host's row. It starts the caller's
 * OWN session in the same group, linked to the room by hostSessionId - always
 * the room's FIRST session, so joining through a participant's code lands in
 * the same room as joining through the host's.
 *
 * The plan is the host's REMAINING time, so everyone in the room finishes
 * together. A host with no plan gives an open-ended session.
 *
 * A PUBLIC group is joined on the way in: anyone may join one anyway, so
 * demanding a separate step first protected nothing. A PRIVATE group still
 * needs its joinCode - an invite code finds a session, it is never a key to the
 * group. That refusal carries the groupId so the client can take the user to
 * the group to enter its code.
 */
export const joinSession = async ({ userId, inviteCode }) => {
  const found = await sessionRepo.findSessionByInviteCode(inviteCode);
  // A solo session has no code, so a hit is always a group session - but the
  // group may since have been deleted, which nulls groupId and leaves nothing
  // to join.
  if (!found || !found.groupId) {
    const err = new Error("No session matches that invite code");
    err.status = 404;
    throw err;
  }

  if (found.endedAt) {
    const err = new Error("That session has already ended");
    err.status = 409;
    throw err;
  }

  // The room's host. A participant's code leads here too; if the host's own
  // row has gone (deleted, so the link was nulled) the found session stands in.
  const host = found.hostSessionId
    ? (await sessionRepo.findSessionById(found.hostSessionId)) ?? found
    : found;
  const roomId = host.id;

  if (found.userId === userId || host.userId === userId) {
    const err = new Error("You're already in this session");
    err.status = 409;
    throw err;
  }

  // BEFORE any membership change, so a refusal here leaves the user exactly as
  // they were rather than half-joined to a group.
  //
  // Two clocks for one person is a double count, so a session that is GENUINELY
  // running - anywhere - still blocks. One a crash left open no longer does:
  // settleOpenSessions closes it first.
  const running = await settleOpenSessions(userId);
  if (running.length > 0) {
    const err = new Error(
      "You have a session running on another device. End it before joining this one.",
    );
    err.status = 409;
    throw err;
  }

  const membership = await findMembership(userId, found.groupId);
  if (!membership) {
    const group = await findGroupById(found.groupId);
    if (group?.isPrivate) {
      const err = new Error(
        "This session is in a private group. Join the group with its code first.",
      );
      err.status = 403;
      err.data = { groupId: found.groupId };
      throw err;
    }

    try {
      await joinGroup(found.groupId, userId);
    } catch (err) {
      // Joined a moment ago by a concurrent request - the outcome wanted.
      if (err.status !== 409) throw err;
    }
  }

  const plannedMinutes = host.plannedMinutes
    ? Math.max(
        1,
        Math.ceil(host.plannedMinutes - (Date.now() - host.startedAt) / 60000),
      )
    : null;

  const session = await openSession({
    userId,
    groupId: found.groupId,
    plannedMinutes,
    hostSessionId: roomId,
  });

  // Everyone already in - the newcomer included, harmlessly - re-reads the room.
  await announceRoom(roomId);

  return session;
};

/**
 * Who is still in the caller's session's room.
 *
 * Asked for by session id rather than room id so the ownership check is the
 * usual one: you can see the room of a session that is yours, and nothing
 * else. A solo session is a room of one.
 *
 * `lastActiveAt` is each session's newest sign of life. The client shows a
 * quiet participant as away rather than dropping them - a locked phone stops
 * sampling too, and that is still someone studying.
 */
export const getRoom = async (sessionId, userId) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);
  const roomId = session.hostSessionId ?? session.id;

  const sessions = await sessionRepo.findRoomSessions(
    roomId,
    new Date(Date.now() - LIVE_SESSION_WINDOW_MS),
  );

  return {
    roomId,
    participants: sessions.map(({ focusSamples, interruptions, userId: owner, ...rest }) => ({
      ...rest,
      lastActiveAt: lastSignOfLife({ ...rest, focusSamples, interruptions }),
      isMine: owner === userId,
    })),
  };
};

export const getSession = async (sessionId, userId) => {
  return getOwnedSessionOrThrow(sessionId, userId);
};

export const listMySessions = async (userId) => {
  return sessionRepo.findSessionsByUser(userId);
};

export const endSession = async (sessionId, userId) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);

  if (session.endedAt) {
    const err = new Error("Session has already ended");
    err.status = 409;
    throw err;
  }

  const { updated, focus, minutesStudied } = await closeSession(session, new Date());

  /**
   * Gamification, and everything about the placement of this block is
   * deliberate.
   *
   * AFTER the session write and its invalidation, because a streak is a
   * consequence of the session having ended rather than part of ending it.
   *
   * NON-FATAL. The session HAS ended - the row is written and the points are
   * banked - so a Redis hiccup or a slow query while updating a streak must not
   * turn a successful request into a 500 that tells the user their session did
   * not save. Ending a session is the single most important write in this app
   * and nothing bolted onto it may be allowed to fail it.
   *
   * SEQUENTIAL rather than Promise.all, and this one is load-bearing:
   * notifyGoalsReached reads the caller's completed sessions to decide whether
   * the goal was just crossed, and recordStudyDay may raise a milestone
   * notification. Running them concurrently would interleave two writers on the
   * same user's notification counter for no measurable gain on two queries.
   *
   * recordStudyDay is idempotent per day, so hanging it off EVERY session end
   * rather than trying to detect the first one of the day is both correct and
   * simpler - see the note on that function.
   */
  try {
    await recordStudyDay(userId);
    await notifyGoalsReached(userId, minutesStudied);
  } catch (err) {
    // WARN, not ERROR: the user-visible operation succeeded and this is a
    // degraded outcome. Logged with the session so a systematic failure is
    // traceable rather than merely counted.
    log.warn(`gamification failed for session ${sessionId}: ${err?.message}`);
  }

  // Merged in rather than left for a second request: `updated` was read before
  // the focus columns were written and would otherwise report a stale null
  // score on the very request that produced one. Falls back to `updated`
  // untouched when scoring failed above.
  return focus
    ? {
        ...updated,
        focusScore: focus.focusScore,
        focusWeightedMinutes: focus.focusWeightedMinutes,
        completionFactor: focus.completionFactor,
        hadWatch: focus.hadWatch,
        tasksTotal: focus.tasksTotal,
        tasksCompleted: focus.tasksCompleted,
      }
    : updated;
};

export const deleteSession = async (sessionId, userId) => {
  await getOwnedSessionOrThrow(sessionId, userId);

  // Read BEFORE the delete: afterwards the FKs are already NULL and there is no
  // way left to find which posts - or which joined sessions - were detached.
  const detached = await findPostRefsBySession(sessionId);
  const participants = await sessionRepo.findParticipantRefs(sessionId);

  const result = await sessionRepo.deleteSession(sessionId);

  // After the write resolves, so a reader cannot cache the pre-delete row under
  // the new version. Three resources touched: this session, every post that
  // pointed at it, and every session that joined it (hostSessionId is now NULL
  // on each, which is part of their payloads).
  await invalidateSession({ sessionIds: [sessionId], ownerIds: [userId] });
  await invalidateDetachedSessions(participants);
  await invalidateDetachedPosts(detached);

  // Anyone who had joined this session has just been cut loose from its room.
  // announceRoom cannot find them by the old room any more - the link is NULL -
  // so they are told directly, with the room id their screens still hold.
  await Promise.all(
    [...new Set(participants.map((ref) => ref.userId))].map((id) =>
      publishNotificationEvent(id, { type: "room:updated", roomId: sessionId }),
    ),
  );

  return result;
};

export const logInterruption = async (sessionId, userId, { durationSec, type = null }) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);

  if (session.endedAt) {
    const err = new Error("Can't log an interruption on an ended session");
    err.status = 409;
    throw err;
  }

  const penaltyApplied = durationSec >= INTERRUPTION_PENALTY_THRESHOLD_SEC;

  const interruption = await sessionRepo.addInterruption({
    sessionId,
    durationSec,
    penaltyApplied,
    type,
  });

  // CONTENT scope only, and the asymmetry is deliberate. findSessionById
  // includes interruptions, so the single-session payload changes; the list
  // does not include them and focusPoints is not recomputed until endSession,
  // so no row of findSessionsByUser is affected. Bumping the owner counter here
  // would throw away a whole cached list on every away-event for nothing.
  await invalidateSession({ sessionIds: [sessionId] });

  return interruption;
};