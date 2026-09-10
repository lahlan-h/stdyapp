import * as streakRepo from "../repositories/streak.repository.js";
// The only sanctioned way to reach prisma.user from here - see follow.service.js.
// It throws its own 404, which is exactly the existence check getStreakForUser
// needs, so nothing here re-implements one.
import { getUserById } from "./user.service.js";
import { emitNotification } from "./notification.service.js";
import { startOfUtcDay, differenceInUtcDays } from "../utils/calendar.js";
import { bumpVersions, streakUserVersionKey } from "../utils/cache.js";

/**
 * Streak rules live HERE and nowhere else.
 *
 * The repository holds an upsert and a lookup and no logic at all, which is
 * what keeps "did they study yesterday" from being re-derived - differently -
 * the first time something other than endSession wants to move a counter.
 */

// Counts worth telling someone about. A week is the first one that feels
// earned; the rest are spaced so the notification stays rare enough to matter.
const MILESTONES = [3, 7, 14, 30, 50, 100, 365];

// One day apart is a continued streak. Anything else is a new one.
const CONSECUTIVE = 1;

/**
 * What a user with no streak row looks like.
 *
 * Returned instead of a 404 because "no streak yet" is a perfectly normal state
 * for a new account, and a profile screen asking for it should render a zero
 * rather than handle an error. The row is created lazily by the first finished
 * session, so the absence of one carries no information a client needs.
 *
 * id is null rather than absent so the response SHAPE is identical either way -
 * a client destructuring the payload should not have to care which branch
 * produced it.
 */
const emptyStreak = (userId) => ({
  id: null,
  userId,
  currentCount: 0,
  lastActiveDate: null,
  isActiveToday: false,
});

/**
 * Turns a stored row into the answer to "what is this person's streak RIGHT
 * NOW".
 *
 * ⚠ THE STORED currentCount IS NOT THE ANSWER, and this is the single most
 * important thing in this file. Nothing runs at midnight to break a lapsed
 * streak - there is no scheduler in this app - so a user who studied ten days
 * running and then stopped for a month still has `currentCount: 10` sitting in
 * the table. Serving that column raw would show a ten-day streak to someone who
 * has not studied since August.
 *
 * So a streak EXPIRES ON READ. If the last active day is neither today nor
 * yesterday, the streak is over and this reports 0 - while leaving the stored
 * row alone, because a read has no business writing and two clients reading at
 * once would race to do it.
 *
 * Yesterday still counts as live: the user has all of today left to continue,
 * and showing a 0 to someone at 9am who studied at 11pm last night would be
 * wrong and would actively discourage the behaviour the feature exists to
 * encourage.
 *
 * @param {object} streak - a row from streaks
 * @returns {object}
 */
const toEffectiveStreak = (streak) => {
  const today = startOfUtcDay(new Date());
  const lastActive = startOfUtcDay(streak.lastActiveDate);
  const daysSince = differenceInUtcDays(today, lastActive);

  const isLive = daysSince <= CONSECUTIVE;

  return {
    id: streak.id,
    userId: streak.userId,
    currentCount: isLive ? streak.currentCount : 0,
    lastActiveDate: streak.lastActiveDate,
    // Lets a client render "you've studied today" without recomputing the day
    // boundary on the device, where it would use the DEVICE's timezone and
    // disagree with the server for several hours a day.
    isActiveToday: daysSince === 0,
  };
};

/**
 * Reads a streak, expiring it on the way out.
 *
 * A row with a null lastActiveDate cannot happen today - recordStudyDay always
 * writes one - but it is nullable in the schema, so the guard is here rather
 * than left as an assumption that would surface as a TypeError inside
 * startOfUtcDay.
 */
const readStreak = async (userId) => {
  const streak = await streakRepo.findStreakByUser(userId);
  if (!streak || !streak.lastActiveDate) return emptyStreak(userId);

  return toEffectiveStreak(streak);
};

/** GET /api/streaks/me. */
export const getMyStreak = async (userId) => readStreak(userId);

/**
 * GET /api/streaks/user/:userId.
 *
 * Open to any authenticated caller, deliberately: the pitch deck's
 * live-tracking leaderboard is the feature this exists for, and a streak nobody
 * else can see is a private note to self.
 *
 * The existence check is what makes an unknown user a 404 rather than a
 * plausible-looking zero streak for an account that was never there.
 */
export const getStreakForUser = async (targetUserId) => {
  await getUserById(targetUserId);

  return readStreak(targetUserId);
};

/**
 * Records that the user studied today, advancing or restarting their streak.
 *
 * THE ONLY WRITER of the streaks table. Called by endSession, and by nothing
 * that a client can reach directly - see the model comment in schema.prisma.
 *
 * IDEMPOTENT PER DAY. A user who finishes four sessions on Tuesday advances the
 * counter once: the second call sees lastActiveDate already equal to today and
 * returns without writing. That is what makes it safe to hang off every single
 * session end rather than trying to detect the first one of the day at the call
 * site.
 *
 * @param {string} userId
 * @param {Date} [now] - injectable so this is testable without mocking the clock
 * @returns {Promise<object>} the effective streak after recording
 */
export const recordStudyDay = async (userId, now = new Date()) => {
  const today = startOfUtcDay(now);
  const existing = await streakRepo.findStreakByUser(userId);

  const lastActive = existing?.lastActiveDate
    ? startOfUtcDay(existing.lastActiveDate)
    : null;

  // Already counted today. Return the current state without touching the row -
  // this is the common case, since most sessions are not the first of their day.
  if (lastActive && differenceInUtcDays(today, lastActive) === 0) {
    return toEffectiveStreak(existing);
  }

  // Exactly one day since the last active day continues the streak. Anything
  // else - a gap, or a first-ever session - starts a new one at 1 rather than
  // 0: the day being recorded is itself the first day of the streak.
  const isConsecutive =
    lastActive && differenceInUtcDays(today, lastActive) === CONSECUTIVE;

  const currentCount = isConsecutive ? existing.currentCount + 1 : 1;

  const updated = await streakRepo.upsertStreak({
    userId,
    currentCount,
    lastActiveDate: today,
  });

  // AFTER the write resolves, per the rule bumpVersions documents.
  await bumpVersions([streakUserVersionKey(userId)]);

  // Only on the exact day the milestone is reached. Because this function runs
  // at most once per day per user, a milestone can be hit at most once per
  // streak, so no de-duplication is needed - contrast the goal notification,
  // which does need it.
  if (MILESTONES.includes(currentCount)) {
    await emitNotification({
      userId,
      type: "STREAK_MILESTONE",
      message: `${currentCount} day streak! Keep it going.`,
    });
  }

  return toEffectiveStreak(updated);
};
