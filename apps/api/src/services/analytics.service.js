// Cross-domain reads, all by repository or read-only service, for the reason
// goal.service.js gives: the caller is already scoped to its own userId, so
// session.service.js's ownership gate would add nothing but a second query.
import { findCompletedSessionsForAnalytics } from "../repositories/session.repository.js";
import { findGoalsByUser } from "../repositories/goal.repository.js";
// A service import rather than the repository, because the streak's EFFECTIVE
// count (expired on read - see toEffectiveStreak) is a rule, and re-deriving it
// here would be a second copy of it to drift.
import { getMyStreak } from "./streak.service.js";
import {
  dateKeysEndingAt,
  localParts,
  shiftDateKey,
  weekStartKey,
} from "../utils/timeZone.js";
import { ANALYTICS_RANGES } from "../validation/analytics.validation.js";

/**
 * Personal study analytics: GET /api/analytics/me.
 *
 * EVERYTHING IS DERIVED, nothing is stored. There is no analytics table, and
 * that is deliberate: every number below is a pure function of sessions,
 * interruptions, goals and the streak, so a stored copy could only ever be a
 * stale copy. The cost is computing on read, which the route caches.
 *
 * EVERY DAY AND HOUR IS IN THE CALLER'S TIMEZONE (?tz=), not UTC - see
 * utils/timeZone.js. The one exception is the current streak, which is read
 * from the streak service as-is so this screen shows the same number as every
 * other screen, even though that number is still counted in UTC days.
 */

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

/**
 * Sessions are split into slices no longer than this before being assigned to
 * an hour of the day.
 *
 * Fifteen minutes because every real UTC offset is a multiple of it (India is
 * +5:30, Nepal +5:45). Slices aligned to 15-minute UTC boundaries therefore
 * never straddle a LOCAL hour boundary in any zone, so each slice belongs to
 * exactly one hour. Slicing by whole UTC hours would be wrong in Adelaide.
 */
const HOUR_SLICE_MS = 15 * MILLISECONDS_PER_MINUTE;

/**
 * The least study time in the range before a per-hour rate is reported.
 *
 * A rate divides by hours studied, and a small divisor makes a small count
 * look huge: one 45-second break in a 5-minute session is "11.2 per hour",
 * which reads as a distraction problem rather than a single break. Below this,
 * the rate is null (a dash on screen) and the plain count still shows beside
 * it. Half an hour means one interruption reads as at most 2/hr.
 */
const MIN_MS_FOR_RATE = 30 * MILLISECONDS_PER_MINUTE;

const toMinutes = (ms) => Math.round(ms / MILLISECONDS_PER_MINUTE);

/** A percentage, or null when there is nothing to divide by. */
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * How long a session ran.
 *
 * Floored at 0 for the reason sumMinutes in goal.service.js gives: a clock
 * adjustment can make a session appear to end before it started.
 */
const durationMs = (session) => Math.max(0, session.endedAt - session.startedAt);

/**
 * Minutes a session contributed to each local hour of the day.
 *
 * Mutates `hourly` (24 buckets of milliseconds) rather than returning, because
 * it is called once per session into one shared accumulator.
 *
 * A session that runs 8:40-10:10 adds 20 minutes to 8am, 60 to 9am and 10 to
 * 10am. Crediting the whole session to its start hour would be simpler, but a
 * two-hour evening session would then read as "you study at 7pm" and never as
 * "you study at 8pm", which is the question the chart exists to answer.
 */
const addToHours = (session, timeZone, hourly) => {
  const end = session.endedAt.getTime();
  let cursor = session.startedAt.getTime();

  while (cursor < end) {
    const sliceEnd = Math.min(end, (Math.floor(cursor / HOUR_SLICE_MS) + 1) * HOUR_SLICE_MS);
    hourly[localParts(new Date(cursor), timeZone).hour] += sliceEnd - cursor;
    cursor = sliceEnd;
  }
};

/**
 * The longest run of consecutive active days in the range.
 *
 * Within the range only, and computed here rather than read from the streak
 * table, which stores just the CURRENT run. Keeping a lifetime best would need
 * a new column written by recordStudyDay; this answers "how consistent was I
 * this week/month", which is what the screen is for.
 */
const longestRun = (dateKeys, isActive) => {
  let best = 0;
  let current = 0;
  for (const key of dateKeys) {
    current = isActive(key) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
};

/**
 * How often a goal was met, over a list of periods.
 *
 * ⚠ THE PERIOD IN PROGRESS COUNTS ONLY ONCE IT IS MET. Today, at 9am, is not a
 * missed day - it is a day that has not happened yet - and counting it as a
 * miss would make every hit rate read worse in the morning than the evening.
 * So an unfinished period joins the denominator the moment it succeeds and not
 * before.
 *
 * @param {Array<{ minutes: number, isCurrent: boolean }>} periods
 * @param {number} targetMinutes
 */
const hitRate = (periods, targetMinutes) => {
  let met = 0;
  let counted = 0;
  for (const { minutes, isCurrent } of periods) {
    const isMet = minutes >= targetMinutes;
    if (isCurrent && !isMet) continue;
    counted += 1;
    if (isMet) met += 1;
  }
  return { targetMinutes, met, counted, hitRatePercent: percent(met, counted) };
};

/**
 * @param {string} userId
 * @param {{ range: string, tz: string }} query - validated; tz is canonical
 * @param {Date} [now] - injectable for tests, like getGoalProgress
 */
export const getMyAnalytics = async (userId, { range, tz }, now = new Date()) => {
  const days = ANALYTICS_RANGES[range];

  // --- The windows, as date labels in the caller's zone ---
  const todayKey = localParts(now, tz).dateKey;
  const rangeKeys = dateKeysEndingAt(todayKey, days);
  const fromKey = rangeKeys[0];
  // The same number of days immediately before, for "vs last period".
  const previousKeys = dateKeysEndingAt(shiftDateKey(fromKey, -1), days);

  // The weekly goal needs whole weeks, and the first week in the range can
  // start up to six days before it. Date keys compare correctly as strings.
  const firstWeekKey = weekStartKey(fromKey);
  const earliestKey = firstWeekKey < previousKeys[0] ? firstWeekKey : previousKeys[0];

  // Midnight UTC on the earliest label, less a day. Local midnight anywhere on
  // Earth is within 14 hours of UTC midnight, so a full day of slack is always
  // enough - sessions outside the labelled windows are filtered out below.
  const since = new Date(Date.parse(`${earliestKey}T00:00:00Z`) - MILLISECONDS_PER_DAY);

  // Three independent reads. Concurrent, unlike endSession's gamification tail,
  // because nothing here writes.
  const [sessions, goals, streak] = await Promise.all([
    findCompletedSessionsForAnalytics(userId, since),
    findGoalsByUser(userId),
    getMyStreak(userId),
  ]);

  // --- Bucket every session by the local day it started on ---
  const msByDay = new Map();
  const rangeKeySet = new Set(rangeKeys);
  const previousKeySet = new Set(previousKeys);

  const inRange = [];
  let previousMs = 0;

  for (const session of sessions) {
    const dayKey = localParts(session.startedAt, tz).dateKey;
    const ms = durationMs(session);
    msByDay.set(dayKey, (msByDay.get(dayKey) ?? 0) + ms);

    if (rangeKeySet.has(dayKey)) inRange.push({ session, ms });
    else if (previousKeySet.has(dayKey)) previousMs += ms;
  }

  const minutesOn = (dayKey) => toMinutes(msByDay.get(dayKey) ?? 0);
  const isActive = (dayKey) => msByDay.has(dayKey);

  // --- 1. Focus time ---
  // Rounded once, at the end, for the reason sumMinutes gives in
  // goal.service.js: rounding per session first makes short sessions vanish.
  const totalMs = inRange.reduce((sum, { ms }) => sum + ms, 0);
  const totalMinutes = toMinutes(totalMs);
  const previousTotalMinutes = toMinutes(previousMs);

  const focusTime = {
    totalMinutes,
    previousTotalMinutes,
    // null rather than +100% or Infinity when last period was empty: "up from
    // nothing" is not a percentage, and the client says so in words instead.
    changePercent:
      previousTotalMinutes > 0
        ? Math.round(((totalMinutes - previousTotalMinutes) / previousTotalMinutes) * 100)
        : null,
    daily: rangeKeys.map((date) => ({ date, minutes: minutesOn(date) })),
  };

  // --- 2. Sessions ---
  const groupMs = inRange
    .filter(({ session }) => session.groupId !== null)
    .reduce((sum, { ms }) => sum + ms, 0);

  const sessionStats = {
    count: inRange.length,
    averageMinutes: inRange.length > 0 ? toMinutes(totalMs / inRange.length) : null,
    longestMinutes:
      inRange.length > 0 ? toMinutes(Math.max(...inRange.map(({ ms }) => ms))) : null,
    soloMinutes: toMinutes(totalMs - groupMs),
    groupMinutes: toMinutes(groupMs),
  };

  // --- 3 & 4. Focus quality ---
  // The denominator for efficiency is rounded PER SESSION on purpose, the
  // opposite of focus time above: it has to match how endSession computed
  // focusPoints (Math.round of each session's minutes), or a session with no
  // interruptions could score 99% or 101%.
  const pointsBasis = inRange.reduce((sum, { ms }) => sum + toMinutes(ms), 0);
  const focusPoints = inRange.reduce((sum, { session }) => sum + session.focusPoints, 0);

  const interruptions = inRange.flatMap(({ session }) => session.interruptions);
  const awaySec = interruptions.reduce((sum, item) => sum + item.durationSec, 0);

  const focusQuality = {
    focusPoints,
    // Capped at 100: focusPoints can never exceed minutes, but a session whose
    // clock went backwards would otherwise let one row push the total over.
    efficiencyPercent:
      pointsBasis > 0 ? Math.min(100, Math.round((focusPoints / pointsBasis) * 100)) : null,
    interruptionCount: interruptions.length,
    penaltyCount: interruptions.filter((item) => item.penaltyApplied).length,
    // One decimal: "1.4 per hour" is the resolution a person reasons in.
    interruptionsPerHour:
      totalMs >= MIN_MS_FOR_RATE
        ? Math.round((interruptions.length / (totalMs / MILLISECONDS_PER_HOUR)) * 10) / 10
        : null,
    averageAwaySec: interruptions.length > 0 ? Math.round(awaySec / interruptions.length) : null,
  };

  // --- 5. Goals ---
  // ⚠ Measured against TODAY'S target, retroactively. Goals are upserted in
  // place with no history, so if someone raised their daily goal from 60 to
  // 120 on Wednesday, Monday is judged against 120. Recording target changes
  // would need a goal_history table - worth it only if this starts to matter.
  //
  // What IS known is when the goal was first set: createdAt, which the upsert
  // in goal.repository.js leaves alone on every later change. Days (and weeks)
  // before that are skipped entirely, not counted as misses - a day nobody had
  // a goal for cannot have failed one. Clearing a goal and setting it again
  // creates a new row, so it starts counting afresh from then.
  const goalByPeriod = Object.fromEntries(goals.map((goal) => [goal.period, goal]));

  // The local day each goal was first set, as a date key comparable by string.
  const goalStartKey = (goal) => localParts(goal.createdAt, tz).dateKey;

  const dailyGoal = goalByPeriod.DAILY
    ? hitRate(
        rangeKeys
          .filter((date) => date >= goalStartKey(goalByPeriod.DAILY))
          .map((date) => ({ minutes: minutesOn(date), isCurrent: date === todayKey })),
        goalByPeriod.DAILY.targetMinutes,
      )
    : null;

  // Every Monday-started week that overlaps the range, summed over all seven of
  // its days - including days before the range starts, which is why the fetch
  // window reaches back to firstWeekKey.
  const weekKeys = [...new Set(rangeKeys.map(weekStartKey))];
  const currentWeekKey = weekStartKey(todayKey);

  // The week the goal was set in DOES count, whole: its minutes from before
  // the goal still went towards the week, and if the week is not over yet it
  // only counts once met anyway (see hitRate).
  const weeklyGoal = goalByPeriod.WEEKLY
    ? hitRate(
        weekKeys
          .filter((weekKey) => weekKey >= weekStartKey(goalStartKey(goalByPeriod.WEEKLY)))
          .map((weekKey) => ({
            minutes: toMinutes(
              dateKeysEndingAt(shiftDateKey(weekKey, DAYS_PER_WEEK - 1), DAYS_PER_WEEK)
                .reduce((sum, date) => sum + (msByDay.get(date) ?? 0), 0),
            ),
            isCurrent: weekKey === currentWeekKey,
          })),
        goalByPeriod.WEEKLY.targetMinutes,
      )
    : null;

  // --- 6. Consistency ---
  const activeDays = rangeKeys.filter(isActive).length;

  const consistency = {
    activeDays,
    activeDayPercent: percent(activeDays, days),
    longestRunDays: longestRun(rangeKeys, isActive),
    currentStreak: streak.currentCount,
    isActiveToday: streak.isActiveToday,
  };

  // --- 7. Peak hours ---
  const hourlyMs = new Array(HOURS_PER_DAY).fill(0);
  for (const { session } of inRange) addToHours(session, tz, hourlyMs);

  const hourlyMinutes = hourlyMs.map(toMinutes);
  const peakMinutes = Math.max(...hourlyMinutes);

  const peakHours = {
    hourly: hourlyMinutes,
    // The EARLIEST of any tied hours, so the answer is stable between requests
    // rather than depending on iteration order.
    peakHour: peakMinutes > 0 ? hourlyMinutes.indexOf(peakMinutes) : null,
  };

  return {
    range: { key: range, days, from: fromKey, to: todayKey, timeZone: tz },
    focusTime,
    sessions: sessionStats,
    focusQuality,
    goals: { daily: dailyGoal, weekly: weeklyGoal },
    consistency,
    peakHours,
  };
};
