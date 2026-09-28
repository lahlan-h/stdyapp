import * as focusRepo from "../repositories/focus.repository.js";
import * as sessionRepo from "../repositories/session.repository.js";
import { HttpError } from "../utils/httpError.js";
import {
  scoreSample,
  scoreSession,
  updateBaseline,
  computeAccuracy,
  CALIBRATION_MIN_SAMPLES,
  RATING_MIN_SAMPLES,
} from "./focusScoring.js";

/**
 * Orchestration for the focus estimate: loading, persisting, and keeping each
 * user's baseline current.
 *
 * All the arithmetic lives in focusScoring.js, which touches no I/O and is
 * tested directly. This file is the part that cannot be unit-tested without a
 * database, so it is kept as thin as possible - it decides WHEN to score, never
 * HOW.
 */

/**
 * The signals a baseline is tracked for. Mirrors the FocusSignal enum in the
 * Prisma schema; a string union rather than an import because @prisma/client
 * only exports enums as values at runtime, and this file should not need the
 * generated client to be readable.
 */
const SIGNALS = Object.freeze({
  MOTION: "MOTION",
  PRESENCE: "PRESENCE",
  HEART_RATE: "HEART_RATE",
});

/**
 * Loads a session and proves the caller owns it.
 *
 * Every exported function here routes through this first. 404 for absent, 403
 * for someone else's - deliberately the same split session.service.js already
 * uses, so a client sees consistent statuses across both features.
 *
 * @param {string} sessionId
 * @param {string} userId
 */
const getOwnedSessionOrThrow = async (sessionId, userId) => {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) throw new HttpError(404, "Session not found");
  if (session.userId !== userId) {
    throw new HttpError(403, "You don't have access to this session");
  }
  return session;
};

/**
 * Reshapes the baseline rows into the map the scorer expects.
 *
 * @param {Array<{ signal: string }>} rows
 * @returns {Record<string, object>}
 */
const toBaselineMap = (rows) =>
  Object.fromEntries(rows.map((row) => [row.signal, row]));

/**
 * Confines a client-supplied timestamp to the session's own window.
 *
 * Clients buffer samples offline and upload them late, so they legitimately own
 * the timestamp - but an unchecked one lets a caller write samples dated into
 * another session, or into the future, which would corrupt both the completion
 * factor and the ordering the timeline chart depends on.
 *
 * @param {Date|undefined} timestamp
 * @param {{ startedAt: Date, endedAt: Date|null }} session
 * @returns {Date}
 */
const clampToSession = (timestamp, session) => {
  const upperBound = session.endedAt ? new Date(session.endedAt) : new Date();
  const lowerBound = new Date(session.startedAt);

  if (!timestamp) return new Date();

  const value = new Date(timestamp);
  if (value < lowerBound) return lowerBound;
  if (value > upperBound) return upperBound;
  return value;
};

/**
 * Stores a batch of samples against a live session.
 *
 * Each sample's per-sample score is computed and stored NOW, against the
 * baseline as it stands at this moment, rather than being recomputed at read
 * time. That is what lets a past session still be explained months later: the
 * user's baseline will have moved on, and rescoring against today's numbers
 * would silently rewrite history.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {Array<object>} samples
 */
export const ingestSamples = async (sessionId, userId, samples) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);

  // Refusing after the fact keeps the completion factor honest: a client that
  // could backfill samples onto a finished session could manufacture coverage
  // it never had.
  if (session.endedAt) {
    throw new HttpError(409, "Can't add focus samples to an ended session");
  }

  const baselines = toBaselineMap(await focusRepo.findBaselinesByUser(userId));

  const rows = samples.map((sample) => ({
    sessionId,
    timestamp: clampToSession(sample.timestamp, session),
    hr: sample.hr ?? null,
    motionVariance: sample.motionVariance,
    inApp: sample.inApp,
    computedFocus: scoreSample(sample, baselines).composite,
  }));

  const { count } = await focusRepo.createSamples(rows);
  return { inserted: count };
};

/**
 * Scores a finished session and folds its readings into the user's baseline.
 *
 * Called from endSession in session.service.js. Deliberately tolerant: a
 * session with no samples is scored as null rather than treated as an error,
 * because a client that failed to report samples must still be able to end its
 * session.
 *
 * @param {string} sessionId
 * @param {string} userId
 */
export const finaliseSessionFocus = async (sessionId, userId) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);

  const [samples, baselineRows] = await Promise.all([
    focusRepo.findSamplesBySession(sessionId),
    focusRepo.findBaselinesByUser(userId),
  ]);

  const result = scoreSession({
    samples,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? new Date(),
    baselines: toBaselineMap(baselineRows),
    plannedMinutes: session.plannedMinutes,
    // findSessionById includes these. Without them the estimate cannot see
    // time the user spent out of the app - see computeAwayFraction.
    interruptions: session.interruptions ?? [],
  });

  await focusRepo.updateSessionFocus(sessionId, {
    focusScore: result.focusScore,
    focusWeightedMinutes: result.focusWeightedMinutes,
    completionFactor: result.completionFactor,
    hadWatch: result.hadWatch,
  });

  // Baselines are updated only AFTER scoring, never before: folding this
  // session's readings in first would score the session partly against itself.
  if (samples.length > 0) {
    await updateBaselinesFromSamples(userId, samples, baselineRows);
  }

  return result;
};

/**
 * Folds one session's readings into the user's running per-signal baselines.
 *
 * @param {string} userId
 * @param {Array<object>} samples
 * @param {Array<object>} baselineRows
 */
const updateBaselinesFromSamples = async (userId, samples, baselineRows) => {
  const existing = toBaselineMap(baselineRows);

  const readings = {
    [SIGNALS.MOTION]: samples.map((s) => s.motionVariance),
    // Presence is tracked as 0/1 so the mean is simply the user's in-app rate.
    // Recorded for reporting only - scorePresence deliberately does not use it.
    [SIGNALS.PRESENCE]: samples.map((s) => (s.inApp ? 1 : 0)),
    [SIGNALS.HEART_RATE]: samples
      .map((s) => s.hr)
      .filter((hr) => Number.isFinite(hr)),
  };

  await Promise.all(
    Object.entries(readings)
      // A watch-free session contributes nothing to the heart-rate baseline,
      // and writing a row for it would create an empty baseline that reads as
      // "tracked but useless".
      .filter(([, values]) => values.length > 0)
      .map(([signal, values]) =>
        focusRepo.upsertBaseline({
          userId,
          signal,
          ...updateBaseline(existing[signal], values),
        }),
      ),
  );
};

/**
 * The stored estimate plus the context needed to explain it.
 *
 * Returns both numbers side by side on purpose: focusPoints is the gamification
 * score and focusScore is the calibrated estimate, and anything consuming this
 * endpoint needs to see that they are two different things.
 *
 * @param {string} sessionId
 * @param {string} userId
 */
export const getSessionFocus = async (sessionId, userId) => {
  const session = await getOwnedSessionOrThrow(sessionId, userId);

  const [sampleCount, rating] = await Promise.all([
    focusRepo.countSamples(sessionId),
    focusRepo.findRatingBySession(sessionId),
  ]);

  return {
    sessionId: session.id,
    // Null while the session is still running or was never measured - NOT 0.
    focusScore: session.focusScore,
    focusWeightedMinutes: session.focusWeightedMinutes,
    completionFactor: session.completionFactor,
    // Returned so a client can tell WHICH completion path produced the number:
    // null here means it came from sample coverage, not a plan.
    plannedMinutes: session.plannedMinutes,
    hadWatch: session.hadWatch,
    focusPoints: session.focusPoints,
    sampleCount,
    // Surfaced so the score is explainable: "you were away for 12 minutes" is
    // the single most useful thing to show next to a low estimate.
    awaySeconds: (session.interruptions ?? []).reduce(
      (sum, i) => sum + (i.durationSec ?? 0),
      0,
    ),
    // Count as well as total, because they say different things: four short
    // glances away is a different session from one long one, and a recap that
    // shows only minutes cannot tell them apart.
    interruptionCount: (session.interruptions ?? []).length,
    selfRating: rating?.selfRating ?? null,
    // Says out loud what this number is, so no client has to infer it.
    isEstimate: true,
  };
};

/**
 * @param {string} sessionId
 * @param {string} userId
 * @param {{ page: number, limit: number }} pagination
 */
export const listSessionSamples = async (sessionId, userId, { page, limit }) => {
  await getOwnedSessionOrThrow(sessionId, userId);

  const [items, total] = await Promise.all([
    focusRepo.findSamplePage(sessionId, { skip: (page - 1) * limit, take: limit }),
    focusRepo.countSamples(sessionId),
  ]);

  return { items, page, limit, total };
};

/**
 * Records the user's own 1-5 verdict - the ground truth the estimate is
 * validated against.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {number} selfRating
 */
export const rateSession = async (sessionId, userId, selfRating) => {
  await getOwnedSessionOrThrow(sessionId, userId);
  return focusRepo.upsertRating({ sessionId, userId, selfRating });
};

/**
 * The caller's calibration state, one entry per signal.
 *
 * `samplesUntilCalibrated` is included so the app can show honest progress
 * ("18 more sessions of data") instead of a bare boolean the user cannot act
 * on.
 *
 * @param {string} userId
 */
export const getBaselines = async (userId) => {
  const rows = await focusRepo.findBaselinesByUser(userId);

  return {
    calibrationThreshold: CALIBRATION_MIN_SAMPLES,
    signals: rows.map((row) => ({
      signal: row.signal,
      mean: row.mean,
      variance: row.variance,
      sampleCount: row.sampleCount,
      isCalibrated: row.isCalibrated,
      samplesUntilCalibrated: Math.max(0, CALIBRATION_MIN_SAMPLES - row.sampleCount),
    })),
  };
};

/** Ratings to consider when measuring accuracy. */
const ACCURACY_SAMPLE_LIMIT = 200;

/**
 * How closely the estimate has matched this user's own verdicts.
 *
 * Per-user rather than global on purpose: the estimate is calibrated against
 * each person's own baseline, so its accuracy is a per-person property. A
 * global average would hide the user for whom it is badly wrong.
 *
 * @param {string} userId
 */
export const getAccuracy = async (userId) => {
  const pairs = await focusRepo.findRatedSessions(userId, ACCURACY_SAMPLE_LIMIT);
  const accuracy = computeAccuracy(pairs);

  return {
    ...accuracy,
    minSamples: RATING_MIN_SAMPLES,
    // Says plainly why the numbers are null, rather than leaving a client to
    // infer it from count < minSamples.
    ready: accuracy.meanAbsoluteError !== null,
    ratedSessions: pairs.filter((p) => p.focusScore !== null).length,
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Focus-weighted minutes over a recent window, biggest first.
 *
 * Weighted minutes rather than raw minutes is the entire point: a leaderboard
 * on time alone rewards leaving a timer running, which is the behaviour this
 * feature exists to see through.
 *
 * @param {string} userId - the caller
 * @param {{ days: number, limit: number }} options
 */
export const getLeaderboard = async (userId, { days, limit }) => {
  const since = new Date(Date.now() - days * DAY_MS);

  const blocked = await focusRepo.findBlockedUserIds(userId);

  const [entries, mine] = await Promise.all([
    focusRepo.sumWeightedMinutesByUser({ since, excludeUserIds: blocked, take: limit }),
    focusRepo.sumWeightedMinutesForUser({ userId, since }),
  ]);

  return {
    since,
    days,
    entries,
    // Always returned, even when the caller is already in `entries`: a client
    // showing "you" in a sticky footer should not have to scan the page to
    // find out whether to render it.
    me: {
      userId,
      weightedMinutes: mine.weightedMinutes,
      sessions: mine.sessions,
      rank: entries.find((e) => e.userId === userId)?.rank ?? null,
    },
  };
};
