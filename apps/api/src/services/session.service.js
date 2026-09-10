import { createLogger } from "@stdyapp/core";

import * as sessionRepo from "../repositories/session.repository.js";
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
import {
  bumpVersions,
  sessionContentVersionKey,
  sessionOwnerVersionKey,
} from "../utils/cache.js";

// 20+ minutes away applies the focus-point penalty and breaks the streak
const INTERRUPTION_PENALTY_THRESHOLD_SEC = 20 * 60;
const FOCUS_POINTS_PER_MINUTE = 1;
const INTERRUPTION_PENALTY_POINTS = 10;

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

export const startSession = async ({ userId, groupId }) => {
  // invite codes only make sense for group sessions — solo sessions get none
  const inviteCode = groupId
    ? Math.random().toString(36).slice(2, 8).toUpperCase()
    : null;

  const session = await sessionRepo.createSession({ userId, groupId, inviteCode });

  // Only the OWNER scope. A brand new session has no cached single-session
  // payload to orphan — nobody can have read an id that did not exist — but it
  // belongs in the caller's list, which someone may well have cached a moment
  // ago.
  await invalidateSession({ ownerIds: [userId] });

  return session;
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

  const endedAt = new Date();
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

  const updated = await sessionRepo.updateSession(sessionId, { endedAt, focusPoints });

  // AFTER the write resolves, never before or concurrently — bumping first lets
  // a reader observe the new version, query the not-yet-committed row, and cache
  // the OLD body under the NEW key, where it would sit for the full TTL.
  //
  // Both scopes: endedAt and focusPoints appear in the single-session payload
  // and in every row of findSessionsByUser.
  await invalidateSession({ sessionIds: [sessionId], ownerIds: [userId] });

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

  return updated;
};

export const deleteSession = async (sessionId, userId) => {
  await getOwnedSessionOrThrow(sessionId, userId);

  // Read BEFORE the delete: afterwards the FK is already NULL and there is no
  // way left to find which posts were detached.
  const detached = await findPostRefsBySession(sessionId);

  const result = await sessionRepo.deleteSession(sessionId);

  // After the write resolves, so a reader cannot cache the pre-delete row under
  // the new version. Two invalidations rather than one because the delete
  // touches two resources: this session, and every post that pointed at it.
  await invalidateSession({ sessionIds: [sessionId], ownerIds: [userId] });
  await invalidateDetachedPosts(detached);

  return result;
};

export const logInterruption = async (sessionId, userId, { durationSec }) => {
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
  });

  // CONTENT scope only, and the asymmetry is deliberate. findSessionById
  // includes interruptions, so the single-session payload changes; the list
  // does not include them and focusPoints is not recomputed until endSession,
  // so no row of findSessionsByUser is affected. Bumping the owner counter here
  // would throw away a whole cached list on every away-event for nothing.
  await invalidateSession({ sessionIds: [sessionId] });

  return interruption;
};