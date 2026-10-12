/**
 * The focus-estimate and task numbers on the analytics screen, as pure
 * functions so they can be unit tested without a database - the same reason
 * focusScoring.js is I/O-free. analytics.service.js owns the query.
 *
 * Everything here reads the columns endSession -> finaliseSessionFocus already
 * wrote onto each Session row (focusScore, focusWeightedMinutes, tasksTotal,
 * tasksCompleted), so no samples or task rows are touched on read.
 *
 * The focus score is always an ESTIMATE, never a medical or clinical
 * measurement - see the note on Session.focusScore in the Prisma schema.
 */

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * Totals over a list of finished sessions.
 *
 * ⚠ AN UNSCORED SESSION IS LEFT OUT, NOT COUNTED AS 0. focusScore is null when
 * a session was never measured (no samples, scoring failed, or it predates the
 * feature), and averaging that in as zero would drag every user's number down
 * for sessions nobody measured. scoredSessionCount says how many the average
 * stands on.
 *
 * TIME-WEIGHTED: a 2-hour session at 80 and a 5-minute session at 20 average
 * to about 78, not 50. A plain mean would let one short false start count as
 * much as an afternoon of work. If every scored session has zero length (a
 * clock adjustment - see durationMs in analytics.service.js) there is nothing
 * to weight by, so it falls back to the plain mean rather than to null.
 *
 * Tasks are summed only over sessions that had a checklist. tasksTotal is null
 * (no checklist, or never finalised) or 0 on the rest, and both add nothing.
 *
 * @param {Array<{ session: {
 *   focusScore?: number|null,
 *   focusWeightedMinutes?: number|null,
 *   tasksTotal?: number|null,
 *   tasksCompleted?: number|null,
 * }, ms: number }>} entries - the in-range sessions with their durations
 * @returns {{
 *   averageFocusScore: number|null,
 *   scoredSessionCount: number,
 *   focusWeightedMinutes: number|null,
 *   tasksCompleted: number,
 *   tasksTotal: number,
 *   taskCompletionPercent: number|null,
 * }}
 */
export const summariseFocusEstimate = (entries) => {
  let scoredSessionCount = 0;
  let scoreSum = 0;
  let weightedScoreSum = 0;
  let weightMs = 0;

  let weightedMinutesSum = 0;
  let hasWeightedMinutes = false;

  let tasksTotal = 0;
  let tasksCompleted = 0;

  for (const { session, ms } of entries) {
    if (isNumber(session.focusScore)) {
      const duration = Math.max(0, ms);
      scoredSessionCount += 1;
      scoreSum += session.focusScore;
      weightedScoreSum += session.focusScore * duration;
      weightMs += duration;
    }

    if (isNumber(session.focusWeightedMinutes)) {
      weightedMinutesSum += session.focusWeightedMinutes;
      hasWeightedMinutes = true;
    }

    if (isNumber(session.tasksTotal) && session.tasksTotal > 0) {
      tasksTotal += session.tasksTotal;
      // Clamped so a bad row can never report more done than there were.
      tasksCompleted += Math.min(
        session.tasksTotal,
        Math.max(0, isNumber(session.tasksCompleted) ? session.tasksCompleted : 0),
      );
    }
  }

  let averageFocusScore = null;
  if (scoredSessionCount > 0) {
    averageFocusScore = Math.round(
      weightMs > 0 ? weightedScoreSum / weightMs : scoreSum / scoredSessionCount,
    );
  }

  return {
    averageFocusScore,
    scoredSessionCount,
    // Rounded once, at the end, for the reason focusTime gives. Null rather
    // than 0 when no session carried a value, for the same reason as the score.
    focusWeightedMinutes: hasWeightedMinutes ? Math.round(weightedMinutesSum) : null,
    tasksCompleted,
    tasksTotal,
    taskCompletionPercent:
      tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : null,
  };
};

/**
 * Change in the average estimate against the previous period, in POINTS.
 *
 * Points rather than a percentage: 60 -> 72 is "+12", and "+20%" of a 0-100
 * score reads as though it were the score itself. Null when either side has no
 * scored session - "up from nothing" is not a change.
 *
 * @param {number|null} current
 * @param {number|null} previous
 * @returns {number|null}
 */
export const focusScoreChange = (current, previous) =>
  isNumber(current) && isNumber(previous) ? current - previous : null;
