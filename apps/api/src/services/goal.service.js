import * as goalRepo from "../repositories/goal.repository.js";
// Cross-domain read. Repository rather than service import, matching how
// user.service.js reaches for findCommentTargetsByUser: going through
// session.service.js would drag its ownership gate along, and the caller here
// is already scoped to its own userId.
import { findCompletedSessionsSince } from "../repositories/session.repository.js";
import { emitNotification } from "./notification.service.js";
import { startOfUtcDay, startOfUtcWeek } from "../utils/calendar.js";
import { HttpError } from "../utils/httpError.js";
import { MAX_DAILY_TARGET_MINUTES } from "../validation/goal.validation.js";
import { bumpVersions, goalOwnerVersionKey } from "../utils/cache.js";

const MILLISECONDS_PER_MINUTE = 60 * 1000;

const notFound = (period) =>
  new HttpError(404, `No ${period.toLowerCase()} goal has been set`);

/**
 * Invalidates this module's cached reads.
 *
 * ONE counter, per user, covering the list, the single goal and the progress
 * payload together. Sessions and routines each need two because they have a
 * per-entity read that a list write must not flush; goals have no such read -
 * GET /:period returns one row of the very list GET / returns, so any write
 * that changes one changes both.
 *
 * Note what this counter does NOT cover: the minutesStudied half of the
 * progress payload, which moves when a SESSION ends rather than when a goal is
 * written. That is why the progress cache is stamped with the session counter
 * as well - see goal.routes.js.
 */
const invalidateGoals = async (userId) => {
  await bumpVersions([goalOwnerVersionKey(userId)]);
};

/**
 * When the current window for a period began.
 *
 * The switch is exhaustive over GoalPeriod, and the throw is what makes adding
 * a third value to that enum a loud failure here rather than a silent one: a
 * new period with no branch would otherwise fall through and return undefined,
 * which findCompletedSessionsSince would hand to Prisma as an unfiltered query
 * - reporting a user's ENTIRE study history as this week's progress.
 *
 * @param {string} period - a GoalPeriod value
 * @param {Date} now
 * @returns {Date}
 */
const periodStart = (period, now) => {
  switch (period) {
    case "DAILY":
      return startOfUtcDay(now);
    case "WEEKLY":
      return startOfUtcWeek(now);
    default:
      throw new HttpError(500, "Unsupported goal period");
  }
};

/**
 * Total minutes studied in the window.
 *
 * Sums in JavaScript over a narrow projection, for the reason
 * findCompletedSessionsSince spells out: Session has no duration column, so
 * there is nothing for Prisma to aggregate.
 *
 * Rounded ONCE at the end rather than per session, which matters more than it
 * looks: rounding each session first and adding after would let twelve
 * 29-second sessions round to zero and vanish, where they are really six
 * minutes of study.
 *
 * @param {Array<{ startedAt: Date, endedAt: Date }>} sessions
 * @returns {number}
 */
const sumMinutes = (sessions) => {
  const totalMs = sessions.reduce(
    (total, session) => total + (session.endedAt - session.startedAt),
    0,
  );

  // Floored at 0 rather than trusted: a clock adjustment between the two
  // timestamps can make a session appear to end before it started, and a
  // negative here would silently eat another session's minutes.
  return Math.max(0, Math.round(totalMs / MILLISECONDS_PER_MINUTE));
};

/**
 * PUT /api/goals/:period.
 *
 * The per-period ceiling lives here rather than in the schema because
 * validate() parses params and body separately, so a body schema cannot see
 * which period it belongs to - see the note on MAX_TARGET_MINUTES.
 *
 * No ownership check, and none is needed: userId is the caller's own id from
 * the access token and the repository scopes on it, so the WHERE clause is the
 * authorisation. There is no goal id anywhere in this router that could name
 * someone else's row.
 */
export const setGoal = async (userId, period, targetMinutes) => {
  if (period === "DAILY" && targetMinutes > MAX_DAILY_TARGET_MINUTES) {
    throw new HttpError(
      400,
      `A daily goal cannot exceed ${MAX_DAILY_TARGET_MINUTES} minutes`,
    );
  }

  const goal = await goalRepo.upsertGoal({ userId, period, targetMinutes });

  await invalidateGoals(userId);

  return goal;
};

/** GET /api/goals - both periods, or fewer if the caller has set fewer. */
export const listMyGoals = async (userId) => goalRepo.findGoalsByUser(userId);

/** GET /api/goals/:period. */
export const getGoal = async (userId, period) => {
  const goal = await goalRepo.findGoalByPeriod(userId, period);
  if (!goal) throw notFound(period);

  return goal;
};

/**
 * DELETE /api/goals/:period.
 *
 * Answers 204 whether or not a goal was there, which is the behaviour
 * deleteGoalByPeriod's deleteMany buys. Clearing a target that is already clear
 * is not an error - the caller asked for a state, and that state now holds.
 *
 * @returns {Promise<{ count: number }>}
 */
export const clearGoal = async (userId, period) => {
  const result = await goalRepo.deleteGoalByPeriod(userId, period);

  // Nothing changed, so nothing is stale - the same guard markAllRead uses.
  if (result.count === 0) return result;

  await invalidateGoals(userId);

  return result;
};

/**
 * GET /api/goals/:period/progress.
 *
 * The read that makes a goal mean anything: a target with no measurement
 * against it is a number in a table.
 *
 * 404s when no goal is set, rather than reporting progress against a target of
 * zero - "you have studied 40 of 0 minutes" is not an answer to any question,
 * and percentComplete would be a division by zero.
 *
 * @returns {Promise<object>}
 */
export const getGoalProgress = async (userId, period, now = new Date()) => {
  const goal = await getGoal(userId, period);

  const since = periodStart(period, now);
  const sessions = await findCompletedSessionsSince(userId, since);
  const minutesStudied = sumMinutes(sessions);

  return {
    period,
    targetMinutes: goal.targetMinutes,
    minutesStudied,
    // Capped at 100 so a client can bind it straight to a progress bar without
    // clamping. minutesStudied is reported uncapped alongside, so nothing is
    // lost - someone who doubled their target can still be shown that.
    percentComplete: Math.min(
      100,
      Math.round((minutesStudied / goal.targetMinutes) * 100),
    ),
    isMet: minutesStudied >= goal.targetMinutes,
    periodStart: since,
    sessionCount: sessions.length,
  };
};

/**
 * Raises a GOAL_REACHED notification if a goal has just been met.
 *
 * Called by endSession, never by a route. Checks every period the user has set
 * a goal for, because finishing one long session can complete a daily and a
 * weekly target at the same moment.
 *
 * ⚠ NEEDS DE-DUPLICATION where the streak milestone does not, and the asymmetry
 * is worth understanding. recordStudyDay writes at most once per day, so a
 * milestone count is reached exactly once. This runs after EVERY session, so
 * without a guard a user who meets their daily goal at noon would get a fresh
 * "goal reached" after every session for the rest of the day.
 *
 * The guard is the streak's own idempotence turned into a flag: the
 * notification is raised only when the session that just ended is the one that
 * CROSSED the line - progress is at or past the target now, and was below it
 * before this session's minutes are subtracted back out. That needs no extra
 * query and no state, and it is exact rather than approximate.
 *
 * ⚠ NEVER THROWS, for emitNotification's reason: it runs on the tail of a
 * session that has already ended, and a failure here must not fail that.
 *
 * @param {string} userId
 * @param {number} sessionMinutes - minutes the just-ended session contributed
 */
export const notifyGoalsReached = async (userId, sessionMinutes) => {
  try {
    const goals = await goalRepo.findGoalsByUser(userId);
    if (goals.length === 0) return;

    for (const goal of goals) {
      const progress = await getGoalProgress(userId, goal.period);

      // Not there yet.
      if (!progress.isMet) continue;

      // Already there BEFORE this session, so somebody has been told already.
      const previousMinutes = progress.minutesStudied - sessionMinutes;
      if (previousMinutes >= goal.targetMinutes) continue;

      await emitNotification({
        userId,
        type: "GOAL_REACHED",
        message: `You hit your ${goal.period.toLowerCase()} goal of ${goal.targetMinutes} minutes.`,
      });
    }
  } catch {
    // Deliberately swallowed and deliberately silent: emitNotification already
    // logs its own failures, and the only other thing that can fail here is a
    // read that will be retried on the next session.
  }
};
