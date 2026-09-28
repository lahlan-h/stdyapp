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
 * Focus-weighted minutes per user since a cutoff, biggest first.
 *
 * groupBy rather than reading the rows and summing in JavaScript: a week of
 * sessions across a cohort is a lot of rows to move for one number each, and
 * Postgres does this in the index.
 *
 * Sessions with a null focusWeightedMinutes are excluded rather than counted as
 * zero — they were never scored, which is not the same as scoring badly.
 *
 * @param {{ since: Date, excludeUserIds?: string[], take: number }} args
 */
export const sumWeightedMinutesByUser = async ({ since, excludeUserIds = [], take }) => {
  const grouped = await prisma.session.groupBy({
    by: ["userId"],
    where: {
      endedAt: { gte: since },
      focusWeightedMinutes: { not: null },
      ...(excludeUserIds.length ? { userId: { notIn: excludeUserIds } } : {}),
    },
    _sum: { focusWeightedMinutes: true },
    _count: { _all: true },
    orderBy: { _sum: { focusWeightedMinutes: "desc" } },
    take,
  });

  if (grouped.length === 0) return [];

  // A second query rather than a join: groupBy cannot include relations, and
  // this is one indexed read on the primary key for a page of at most `take`.
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return grouped.map((g, i) => ({
    rank: i + 1,
    userId: g.userId,
    username: byId.get(g.userId)?.username ?? null,
    avatarUrl: byId.get(g.userId)?.avatarUrl ?? null,
    weightedMinutes: g._sum.focusWeightedMinutes ?? 0,
    sessions: g._count._all,
  }));
};

/**
 * One user's own weighted-minutes total since a cutoff, so the caller can be
 * shown their standing even when they are nowhere near the top of the board.
 *
 * @param {{ userId: string, since: Date }} args
 */
export const sumWeightedMinutesForUser = async ({ userId, since }) => {
  const agg = await prisma.session.aggregate({
    where: { userId, endedAt: { gte: since }, focusWeightedMinutes: { not: null } },
    _sum: { focusWeightedMinutes: true },
    _count: { _all: true },
  });

  return {
    weightedMinutes: agg._sum.focusWeightedMinutes ?? 0,
    sessions: agg._count._all,
  };
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
