import * as sessionRepo from "../repositories/session.repository.js";
// Deleting a session nulls posts.sessionId via ON DELETE SET NULL — a write to
// posts that never passes through post.service.js, so its cache has to be told.
import { findPostRefsBySession } from "../repositories/post.repository.js";
import { invalidateDetachedPosts } from "./post.service.js";

// 20+ minutes away applies the focus-point penalty and breaks the streak
const INTERRUPTION_PENALTY_THRESHOLD_SEC = 20 * 60;
const FOCUS_POINTS_PER_MINUTE = 1;
const INTERRUPTION_PENALTY_POINTS = 10;

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

export const startSession = async ({ userId, groupId }) => {
  // invite codes only make sense for group sessions — solo sessions get none
  const inviteCode = groupId
    ? Math.random().toString(36).slice(2, 8).toUpperCase()
    : null;

  return sessionRepo.createSession({ userId, groupId, inviteCode });
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

  return sessionRepo.updateSession(sessionId, { endedAt, focusPoints });
};

export const deleteSession = async (sessionId, userId) => {
  await getOwnedSessionOrThrow(sessionId, userId);

  // Read BEFORE the delete: afterwards the FK is already NULL and there is no
  // way left to find which posts were detached.
  const detached = await findPostRefsBySession(sessionId);

  const result = await sessionRepo.deleteSession(sessionId);

  // After the write resolves, so a reader cannot cache the pre-delete row under
  // the new version.
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

  return sessionRepo.addInterruption({ sessionId, durationSec, penaltyApplied });
};