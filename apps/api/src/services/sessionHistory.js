/**
 * The shape of one row of GET /api/sessions - the caller's study history.
 *
 * Pure: no I/O, so it is tested directly (test/sessionHistory.test.js), the
 * same split focusScoring.js makes for the estimate. session.service.js loads
 * the rows; this decides what each one says.
 *
 * ADDITIVE ONLY. Every scalar column the list returned before this existed is
 * passed through untouched - useStudySessions and anything else reading the
 * list keep working - and the derived fields are added beside them. The two
 * relations the repository now includes (interruptions, focusRating) are
 * folded into summary numbers and dropped, so the payload carries counts
 * rather than an array per row.
 */
import { activeMinutes } from "./sessionPause.js";

/**
 * A session still open after this long was not finished, it was left.
 *
 * The same 24 hours session.validation.js caps a planned session at: nothing
 * longer is a plausible study session, so an open row past it is a client that
 * never sent PATCH /end (app killed, phone died), not one still running.
 */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * "ended", "active" or "abandoned".
 *
 * Derived rather than stored: there is no status column, and "abandoned" is a
 * judgement about elapsed time that would go stale the moment it was written.
 *
 * @param {{ startedAt: Date | string, endedAt: Date | string | null }} session
 * @param {Date} [now]
 * @returns {"ended" | "active" | "abandoned"}
 */
export const sessionStatus = (session, now = new Date()) => {
  if (session.endedAt) return "ended";
  const age = now.getTime() - new Date(session.startedAt).getTime();
  return age >= ABANDONED_AFTER_MS ? "abandoned" : "active";
};

/**
 * Whole minutes studied, breaks left out, rounded and floored at zero exactly
 * as endSession derives minutesStudied - the same activeMinutes - so the
 * history agrees with the XP the session banked. Null while there is no end:
 * a running session has no duration yet, and 0 would read as a session that
 * lasted no time.
 *
 * @param {{ startedAt: Date | string, endedAt: Date | string | null, pausedSeconds?: number }} session
 * @returns {number | null}
 */
export const sessionDurationMinutes = (session) =>
  session.endedAt ? activeMinutes(session) : null;

/**
 * One list row: the session's own columns plus what the history screen needs
 * to describe it without a request per row.
 *
 * @param {object} row - a Session row with `interruptions: [{ durationSec }]`
 *   and `focusRating: { selfRating } | null` included.
 * @param {Date} [now]
 */
export const toSessionHistoryRow = (row, now = new Date()) => {
  const { interruptions, focusRating, ...session } = row;
  const away = interruptions ?? [];

  return {
    ...session,
    status: sessionStatus(session, now),
    durationMinutes: sessionDurationMinutes(session),
    // Count and total together, for the reason getSessionFocus gives: four
    // glances away and one long absence are different sessions.
    interruptionCount: away.length,
    awaySeconds: away.reduce((sum, i) => sum + (i.durationSec ?? 0), 0),
    // Null, never 0: the scale is 1-5, and "not rated" is not a rating.
    selfRating: focusRating?.selfRating ?? null,
    isGroup: session.groupId != null,
  };
};
