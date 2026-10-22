import { prisma } from "@stdyapp/core";

/**
 * Every Prisma call the focus feature makes. No business logic lives here -
 * that is focus.service.js - and no other file in this feature imports prisma,
 * matching the layering the rest of the API already follows.
 */

/**
 * Fields of a focus sample that the scorer and the API actually need.
 *
 * An explicit select rather than the whole row: this is the biggest table in
 * the feature, and a session's worth of samples is loaded on every finalise.
 */
const SAMPLE_SELECT = {
  id: true,
  timestamp: true,
  hr: true,
  motionVariance: true,
  inApp: true,
  computedFocus: true,
};

/**
 * @param {Array<{ sessionId: string, timestamp: Date, hr: number|null, motionVariance: number, inApp: boolean, computedFocus: number }>} rows
 * @returns {Promise<{ count: number }>}
 */
export const createSamples = (rows) => {
  return prisma.focusSample.createMany({ data: rows });
};

/**
 * Whole session, in time order - what the scorer consumes.
 *
 * Unpaginated by design: a session is bounded by how long a person can study,
 * and the scorer needs every sample or the average is wrong.
 *
 * @param {string} sessionId
 */
export const findSamplesBySession = (sessionId) => {
  return prisma.focusSample.findMany({
    where: { sessionId },
    orderBy: { timestamp: "asc" },
    select: SAMPLE_SELECT,
  });
};

/**
 * One page of samples, for the in-app timeline chart.
 *
 * @param {string} sessionId
 * @param {{ skip: number, take: number }} page
 */
export const findSamplePage = (sessionId, { skip, take }) => {
  return prisma.focusSample.findMany({
    where: { sessionId },
    orderBy: { timestamp: "asc" },
    select: SAMPLE_SELECT,
    skip,
    take,
  });
};

/** @param {string} sessionId */
export const countSamples = (sessionId) => {
  return prisma.focusSample.count({ where: { sessionId } });
};

/**
 * Writes ONLY the focus columns of a session row.
 *
 * A focus repository touching the sessions table is a deliberate, narrow
 * exception. The alternative was adding a function to session.repository.js,
 * which belongs to another feature; confining the write here keeps this
 * feature's diff inside its own files. It never touches focusPoints, which is
 * the other feature's number.
 *
 * @param {string} sessionId
 * @param {{ focusScore: number|null, focusWeightedMinutes: number|null, completionFactor: number|null, hadWatch: boolean }} focus
 */
export const updateSessionFocus = (sessionId, focus) => {
  return prisma.session.update({
    where: { id: sessionId },
    data: focus,
    select: {
      id: true,
      focusScore: true,
      focusWeightedMinutes: true,
      completionFactor: true,
      hadWatch: true,
      tasksTotal: true,
      tasksCompleted: true,
      // Returned so a caller can see both numbers side by side and never has to
      // guess which is which.
      focusPoints: true,
    },
  });
};

/**
 * One rating per session - a resubmission replaces the previous verdict rather
 * than stacking a second one that would pull calibration a different way.
 *
 * @param {{ sessionId: string, userId: string, selfRating: number }} rating
 */
export const upsertRating = ({ sessionId, userId, selfRating }) => {
  return prisma.focusRating.upsert({
    where: { sessionId },
    create: { sessionId, userId, selfRating },
    update: { selfRating },
  });
};

/** @param {string} sessionId */
export const findRatingBySession = (sessionId) => {
  return prisma.focusRating.findUnique({ where: { sessionId } });
};

/** @param {string} userId */
export const findBaselinesByUser = (userId) => {
  return prisma.focusBaseline.findMany({ where: { userId } });
};

/**
 * @param {{ userId: string, signal: string, mean: number, variance: number, sampleCount: number, isCalibrated: boolean }} baseline
 */
export const upsertBaseline = ({
  userId,
  signal,
  mean,
  variance,
  sampleCount,
  isCalibrated,
}) => {
  const stats = { mean, variance, sampleCount, isCalibrated };
  return prisma.focusBaseline.upsert({
    where: { userId_signal: { userId, signal } },
    create: { userId, signal, ...stats },
    update: stats,
  });
};

/**
 * Every rated session of one user, as (estimate, self-rating) pairs.
 *
 * Driven from focusRatings rather than sessions because that is the smaller
 * side by far — most sessions are never rated — and focus_ratings has an index
 * on userId for exactly this query.
 *
 * @param {string} userId
 * @param {number} take
 */
export const findRatedSessions = async (userId, take) => {
  const rows = await prisma.focusRating.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      selfRating: true,
      createdAt: true,
      session: { select: { id: true, focusScore: true, endedAt: true } },
    },
  });

  return rows.map((row) => ({
    sessionId: row.session?.id ?? null,
    focusScore: row.session?.focusScore ?? null,
    selfRating: row.selfRating,
    ratedAt: row.createdAt,
  }));
};

/**
 * The Session column and aggregate behind each leaderboard metric.
 *
 * Keys mirror METRICS in services/focusLeaderboard.js. One table rather than a
 * function per metric because the three boards are the same query - group the
 * window's sessions by user - differing only in which column they fold.
 */
const LEADERBOARD_COLUMNS = Object.freeze({
  weightedMinutes: { column: "focusWeightedMinutes", agg: "_sum" },
  focusScore: { column: "focusScore", agg: "_avg" },
  tasksCompleted: { column: "tasksCompleted", agg: "_sum" },
});

/**
 * The WHERE shared by the board and the caller's own row, so the two can never
 * disagree about which sessions count.
 *
 * Sessions with a null metric column are excluded rather than counted as zero:
 * they were never scored (or had no checklist), which is not the same as
 * scoring badly. `since` null means all time, which still requires the session
 * to have ended - a running session has no score yet.
 *
 * @param {string} column
 * @param {Date|null} since
 */
const leaderboardWhere = (column, since) => ({
  endedAt: since ? { gte: since } : { not: null },
  [column]: { not: null },
});

/**
 * One metric aggregated per user, biggest first.
 *
 * groupBy rather than reading the rows and summing in JavaScript: a week of
 * sessions across a cohort is a lot of rows to move for one number each, and
 * Postgres does this in the index.
 *
 * The session floor is a HAVING, so a user below it never reaches the page and
 * cannot push someone qualified out of the `take`.
 *
 * @param {{ metric: string, since: Date|null, userIds?: string[], excludeUserIds?: string[], minSessions?: number, take?: number }} args
 *   userIds restricts to an audience (a following board); omitted means
 *   everyone. take omitted means every qualifying user.
 * @returns {Promise<Array<{ userId: string, value: number, sessions: number }>>}
 */
export const aggregateSessionsByUser = async ({
  metric,
  since,
  userIds,
  excludeUserIds = [],
  minSessions = 1,
  take,
}) => {
  const { column, agg } = LEADERBOARD_COLUMNS[metric];

  let userFilter = {};
  if (userIds) {
    const excluded = new Set(excludeUserIds);
    userFilter = { userId: { in: userIds.filter((id) => !excluded.has(id)) } };
  } else if (excludeUserIds.length) {
    userFilter = { userId: { notIn: excludeUserIds } };
  }

  const grouped = await prisma.session.groupBy({
    by: ["userId"],
    where: { ...leaderboardWhere(column, since), ...userFilter },
    [agg]: { [column]: true },
    _count: { _all: true },
    ...(minSessions > 1 ? { having: { [column]: { _count: { gte: minSessions } } } } : {}),
    // userId second so ties come back in a stable order between refreshes.
    orderBy: [{ [agg]: { [column]: "desc" } }, { userId: "asc" }],
    ...(take ? { take } : {}),
  });

  return grouped.map((g) => ({
    userId: g.userId,
    value: g[agg][column] ?? 0,
    sessions: g._count._all,
  }));
};

/**
 * One user's own aggregate for a metric, so the caller can be shown their
 * standing even when they are nowhere near the top of the board - or below the
 * session floor and not on it at all.
 *
 * @param {{ metric: string, userId: string, since: Date|null }} args
 * @returns {Promise<{ value: number|null, sessions: number }>}
 */
export const aggregateSessionsForUser = async ({ metric, userId, since }) => {
  const { column, agg } = LEADERBOARD_COLUMNS[metric];
  const result = await prisma.session.aggregate({
    where: { userId, ...leaderboardWhere(column, since) },
    [agg]: { [column]: true },
    _count: { _all: true },
  });

  return { value: result[agg][column] ?? null, sessions: result._count._all };
};

/**
 * The people on one page of a board, by id.
 *
 * A second query rather than a join: groupBy cannot include relations, and
 * this is one indexed read on the primary key for at most a page plus the
 * caller. An explicit select, so email and passwordHash never ride along on a
 * social surface.
 *
 * @param {string[]} ids
 */
export const findLeaderboardUsers = (ids) => {
  if (ids.length === 0) return Promise.resolve([]);
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
  });
};

/**
 * Everyone this user follows, as bare ids - the audience of a "following"
 * board.
 *
 * Here rather than borrowed from follow.repository.js, whose readers join the
 * followed user on for a list screen; the board needs only the ids, and keeping
 * the read in this file keeps the feature's diff inside its own files. Served
 * by the leading column of @@unique([followerId, followingId]).
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findFollowingIds = async (userId) => {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
};

/**
 * Both directions of the block relation for one user.
 *
 * Both, not just the caller's own blocks: a leaderboard is a social surface, so
 * someone who blocked the caller must not be shown to them either. Mirrors what
 * the feed already does.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findBlockedUserIds = async (userId) => {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });

  const ids = new Set();
  for (const row of rows) {
    ids.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  return [...ids];
};

/**
 * Private accounts this user may NOT see - every private user but themselves
 * and the ones they are an approved follower of. The global board leaves these
 * out; see authorVisibleTo in post.repository.js for the same rule as a filter.
 *
 * Only the global board asks. A following board already holds approved follows
 * and nothing else, and a group's board shows its members to each other by
 * design.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findHiddenPrivateUserIds = async (userId) => {
  const rows = await prisma.user.findMany({
    where: {
      isPrivate: true,
      id: { not: userId },
      followers: { none: { followerId: userId } },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
};

/** @param {string} userId */
export const findCalibration = (userId) => {
  return prisma.focusCalibration.findUnique({ where: { userId } });
};

/**
 * @param {{ userId: string, offset: number, ratingCount: number }} calibration
 */
export const upsertCalibration = ({ userId, offset, ratingCount }) => {
  const stats = { offset, ratingCount };
  return prisma.focusCalibration.upsert({
    where: { userId },
    create: { userId, ...stats },
    update: stats,
  });
};

// ---------------------------------------------------------------------------
// Session checklist
// ---------------------------------------------------------------------------

const TASK_SELECT = {
  id: true,
  title: true,
  isComplete: true,
  completedAt: true,
  position: true,
};

/** @param {string} sessionId */
export const findTasksBySession = (sessionId) => {
  return prisma.sessionTask.findMany({
    where: { sessionId },
    orderBy: { position: "asc" },
    select: TASK_SELECT,
  });
};

/**
 * Appends items to a session's checklist.
 *
 * Positions continue from whatever is already there rather than restarting at
 * zero, so adding mid-session does not interleave new items with old ones.
 *
 * @param {{ sessionId: string, titles: string[], startPosition: number }} args
 */
export const createTasks = ({ sessionId, titles, startPosition }) => {
  return prisma.sessionTask.createMany({
    data: titles.map((title, i) => ({
      sessionId,
      title,
      position: startPosition + i,
    })),
  });
};

/** @param {string} sessionId */
export const countTasks = (sessionId) => {
  return prisma.sessionTask.count({ where: { sessionId } });
};

/**
 * Ticks or un-ticks one item.
 *
 * Scoped by sessionId as well as id, so a task id from someone else's session
 * cannot be toggled by guessing it - the ownership check upstream covers the
 * session, and this makes the task belong to it.
 *
 * @param {{ sessionId: string, taskId: string, isComplete: boolean }} args
 */
export const setTaskComplete = async ({ sessionId, taskId, isComplete }) => {
  const result = await prisma.sessionTask.updateMany({
    where: { id: taskId, sessionId },
    // completedAt is cleared on un-tick: a timestamp left behind would claim
    // the item was finished when the boolean says it was not.
    data: { isComplete, completedAt: isComplete ? new Date() : null },
  });
  return result.count > 0;
};

/** @param {{ sessionId: string, taskId: string }} args */
export const deleteTask = async ({ sessionId, taskId }) => {
  const result = await prisma.sessionTask.deleteMany({
    where: { id: taskId, sessionId },
  });
  return result.count > 0;
};
