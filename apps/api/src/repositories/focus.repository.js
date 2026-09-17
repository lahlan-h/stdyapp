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
