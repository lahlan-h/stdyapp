/**
 * The focus estimate, as pure arithmetic.
 *
 * NOTHING in this file touches the database, the network, the clock or
 * process.env. Every function takes plain values and returns plain values.
 * That is deliberate and load-bearing: it is what lets the whole estimate be
 * tested under `node --test` with no database, no mocks and no dependencies.
 * Anything needing I/O belongs in focus.service.js instead.
 *
 * WHAT THIS PRODUCES IS AN ESTIMATE. It is a personally-calibrated guess at how
 * focused a study session was, built from a phone's sensors. It is not a
 * medical or clinical measurement of attention, and must never be presented as
 * one.
 *
 * The method, in one paragraph: each sample is scored per signal against the
 * user's OWN normal for that signal (a z-score), not against an absolute
 * threshold, because "still" and "restless" mean different things for different
 * people. Those per-signal scores are combined into one 0-1 number per sample,
 * averaged over the session, blended with how much of the session was actually
 * seen through, and finally scaled to 0-100.
 */

/**
 * Relative importance of each signal in the per-sample composite.
 *
 * Presence leads because it is the only signal that is directly observed rather
 * than inferred - the app either had focus or it did not. Heart rate is worth
 * the least despite being the most sophisticated input: it is the stretch-goal
 * signal, absent for most users, and the noisiest of the three.
 *
 * These need not sum to 1. When a signal is missing the remaining weights are
 * renormalised over whatever is left, so the sum is recomputed at scoring time.
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  MOTION: 0.35,
  PRESENCE: 0.45,
  HEART_RATE: 0.2,
});

/**
 * How much of the final score comes from the samples themselves, with the
 * remainder coming from session completion.
 *
 * Completion is a MODEST term on purpose. It is a blunt signal - it says
 * something about commitment but nothing about attention - so it nudges the
 * estimate rather than driving it. Weighting it heavily would let a user score
 * well by simply letting a timer run.
 */
export const SAMPLE_WEIGHT = 0.85;
export const COMPLETION_WEIGHT = 1 - SAMPLE_WEIGHT;

/**
 * Samples a user must have contributed for a signal before their own baseline
 * is trusted over the population default.
 *
 * A baseline built from three samples is worse than no baseline at all: it has
 * a tiny, arbitrary variance, which makes every subsequent z-score enormous and
 * every score extreme. Better to look like everyone else until there is enough
 * evidence to look like yourself.
 */
export const CALIBRATION_MIN_SAMPLES = 30;

/**
 * Fallback statistics for an uncalibrated user.
 *
 * Rough, deliberately wide starting points rather than precise figures - wide
 * variance keeps early z-scores small, so a new user's estimate hovers near the
 * middle instead of swinging to the extremes on their first session.
 *
 * MOTION is the variance of accelerometer magnitude in g^2; HEART_RATE is BPM.
 * PRESENCE has no baseline - see scorePresence below.
 */
export const POPULATION_BASELINES = Object.freeze({
  MOTION: Object.freeze({ mean: 0.35, variance: 0.04 }),
  HEART_RATE: Object.freeze({ mean: 72, variance: 64 }),
});

/**
 * A standard deviation at or below this counts as degenerate.
 *
 * Not an arbitrary epsilon: a baseline whose variance has collapsed to ~zero
 * cannot discriminate between any two readings, so dividing by it would turn
 * the tiniest difference into an enormous z-score. Such a baseline is treated
 * as absent rather than as infinitely precise.
 */
export const MIN_STANDARD_DEVIATION = 1e-6;

/** Steepness of the motion logistic. 1 keeps a 1-sigma move worth ~0.23. */
const MOTION_SLOPE = 1;

/**
 * @param {number} value
 * @returns {number} value confined to [0, 1]
 */
export const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Decides which statistics to score a signal against.
 *
 * Returns the population default whenever the personal baseline is missing, not
 * yet calibrated, or degenerate - the three ways a baseline can be present but
 * untrustworthy.
 *
 * @param {{ mean: number, variance: number, sampleCount?: number, isCalibrated?: boolean } | null | undefined} baseline
 * @param {{ mean: number, variance: number }} fallback
 * @returns {{ mean: number, standardDeviation: number, usedBaseline: boolean }}
 */
export const resolveBaseline = (baseline, fallback) => {
  const usable =
    baseline &&
    baseline.isCalibrated === true &&
    Number.isFinite(baseline.mean) &&
    Number.isFinite(baseline.variance) &&
    Math.sqrt(Math.max(0, baseline.variance)) > MIN_STANDARD_DEVIATION;

  const source = usable ? baseline : fallback;

  return {
    mean: source.mean,
    standardDeviation: Math.sqrt(Math.max(0, source.variance)),
    usedBaseline: Boolean(usable),
  };
};

/**
 * Standard score of a reading against a baseline.
 *
 * Returns 0 - "exactly typical" - rather than Infinity or NaN when the spread
 * is degenerate. resolveBaseline should already have prevented that, so this is
 * the second line of defence, not the first.
 *
 * @param {number} value
 * @param {{ mean: number, standardDeviation: number }} stats
 * @returns {number}
 */
export const zScore = (value, { mean, standardDeviation }) => {
  if (!(standardDeviation > MIN_STANDARD_DEVIATION)) return 0;
  const z = (value - mean) / standardDeviation;
  return Number.isFinite(z) ? z : 0;
};

/**
 * Stillness, scored 0-1.
 *
 * ASYMMETRIC, unlike heart rate: moving much more than usual is evidence of
 * distraction, but being unusually still is not evidence of anything wrong, so
 * the curve rises towards 1 rather than falling away on both sides. A logistic
 * also saturates gracefully, so one wild accelerometer reading cannot drag a
 * whole session down the way an unbounded linear penalty would.
 *
 * @param {number} motionVariance
 * @param {object|null} baseline
 * @returns {number} 0 (constant movement) to 1 (unusually still)
 */
export const scoreMotion = (motionVariance, baseline) => {
  const stats = resolveBaseline(baseline, POPULATION_BASELINES.MOTION);
  const z = zScore(motionVariance, stats);
  return clamp01(1 / (1 + Math.exp(MOTION_SLOPE * z)));
};

/**
 * Presence, scored 0-1.
 *
 * Deliberately NOT z-scored, unlike the other two. Presence is a single
 * boolean per sample, so there is no spread within a sample to standardise
 * against, and standardising it against the user's own average presence would
 * be perverse: it would mean a user who is usually distracted gets credit for
 * being distracted at their usual rate. Being out of the app is not focus for
 * anyone, so this one signal is scored absolutely.
 *
 * The user's presence baseline is still tracked - it is useful for reporting -
 * it just does not feed this number.
 *
 * @param {boolean} inApp
 * @returns {0 | 1}
 */
export const scorePresence = (inApp) => (inApp ? 1 : 0);

/**
 * Heart-rate steadiness, scored 0-1.
 *
 * SYMMETRIC, unlike motion: the spec asks for steadiness, so what matters is
 * distance from the user's typical study heart rate in EITHER direction. A
 * spike suggests stress or activity; an unusual drop suggests they stopped
 * working. A Gaussian kernel gives 1.0 at the baseline and decays smoothly.
 *
 * @param {number} hr - beats per minute
 * @param {object|null} baseline
 * @returns {number}
 */
export const scoreHeartRate = (hr, baseline) => {
  const stats = resolveBaseline(baseline, POPULATION_BASELINES.HEART_RATE);
  const z = zScore(hr, stats);
  return clamp01(Math.exp(-0.5 * z * z));
};

/**
 * Combines one sample's signals into a single 0-1 score.
 *
 * When heart rate is absent - which is the common case, since it needs a paired
 * watch - its weight is REDISTRIBUTED across the signals that are present
 * rather than counted as zero. Scoring a missing signal as zero would punish
 * every user without a watch, which is most of them.
 *
 * @param {{ motionVariance: number, inApp: boolean, hr?: number|null }} sample
 * @param {{ MOTION?: object|null, HEART_RATE?: object|null }} [baselines]
 * @returns {{ motion: number, presence: number, heartRate: number|null, composite: number }}
 */
export const scoreSample = (sample, baselines = {}) => {
  const motion = scoreMotion(sample.motionVariance, baselines.MOTION);
  const presence = scorePresence(sample.inApp);

  const hasHeartRate = Number.isFinite(sample.hr);
  const heartRate = hasHeartRate
    ? scoreHeartRate(sample.hr, baselines.HEART_RATE)
    : null;

  let weighted = motion * SIGNAL_WEIGHTS.MOTION + presence * SIGNAL_WEIGHTS.PRESENCE;
  let totalWeight = SIGNAL_WEIGHTS.MOTION + SIGNAL_WEIGHTS.PRESENCE;

  if (heartRate !== null) {
    weighted += heartRate * SIGNAL_WEIGHTS.HEART_RATE;
    totalWeight += SIGNAL_WEIGHTS.HEART_RATE;
  }

  return {
    motion,
    presence,
    heartRate,
    composite: clamp01(weighted / totalWeight),
  };
};

/**
 * How much of the session the sampling actually covered, 0-1.
 *
 * A note on what this measures, because it is not what the original spec
 * described. The spec framed completion as time served against a PLANNED
 * duration - but no planned duration is recorded anywhere in the schema, and
 * adding one would mean changing the session-create endpoint, which belongs to
 * another feature. Sample coverage is derivable from data that already exists
 * and captures the same thing in practice: a user who abandons a session
 * halfway stops producing samples halfway, so coverage falls. A user who sees
 * it through produces samples to the end, and coverage approaches 1.
 *
 * Returns 0 for a session with fewer than two samples: a single sample spans no
 * time, so nothing has been covered.
 *
 * @param {{ startedAt: Date, endedAt: Date, samples: Array<{ timestamp: Date }> }} args
 * @returns {number}
 */
export const computeCompletionFactor = ({ startedAt, endedAt, samples }) => {
  if (!Array.isArray(samples) || samples.length < 2) return 0;

  const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!(elapsedMs > 0)) return 0;

  const times = samples.map((s) => new Date(s.timestamp).getTime());
  const coveredMs = Math.max(...times) - Math.min(...times);

  return clamp01(coveredMs / elapsedMs);
};

/**
 * Turns a session's samples into the four values stored on the Session row.
 *
 * Returns nulls - never zeros - when there is nothing to score. "We did not
 * measure this session" and "we measured it and the user was completely
 * unfocused" are different facts, and collapsing them would quietly libel every
 * user whose client failed to report samples.
 *
 * @param {{
 *   samples: Array<{ motionVariance: number, inApp: boolean, hr?: number|null, timestamp: Date }>,
 *   startedAt: Date,
 *   endedAt: Date,
 *   baselines?: object,
 * }} args
 * @returns {{
 *   focusScore: number|null,
 *   focusWeightedMinutes: number|null,
 *   completionFactor: number|null,
 *   hadWatch: boolean,
 *   sampleCount: number,
 * }}
 */
export const scoreSession = ({ samples, startedAt, endedAt, baselines = {} }) => {
  const list = Array.isArray(samples) ? samples : [];

  // A watch was involved if ANY sample carried a heart rate. Partial coverage
  // still counts - the session was scored on a different path from a
  // watch-free one, and that is what this flag exists to record.
  const hadWatch = list.some((s) => Number.isFinite(s.hr));

  if (list.length === 0 || !endedAt) {
    return {
      focusScore: null,
      focusWeightedMinutes: null,
      completionFactor: null,
      hadWatch,
      sampleCount: 0,
    };
  }

  const meanComposite =
    list.reduce((sum, sample) => sum + scoreSample(sample, baselines).composite, 0) /
    list.length;

  const completionFactor = computeCompletionFactor({ startedAt, endedAt, samples: list });

  const blended = clamp01(
    SAMPLE_WEIGHT * meanComposite + COMPLETION_WEIGHT * completionFactor,
  );

  const focusScore = Math.round(blended * 100);

  const elapsedMinutes = Math.max(
    0,
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000,
  );

  // Derived from the ROUNDED score on purpose, so the stored minutes always
  // reconcile with the score the user was shown. Deriving from `blended` would
  // leave the two disagreeing in the last decimal for no benefit.
  const focusWeightedMinutes = elapsedMinutes * (focusScore / 100);

  return {
    focusScore,
    focusWeightedMinutes,
    completionFactor,
    hadWatch,
    sampleCount: list.length,
  };
};

/**
 * Folds new readings into a running baseline (Welford's algorithm).
 *
 * Incremental rather than a recomputation over every sample the user has ever
 * produced: that query grows without bound, this one is O(new samples) forever.
 * Welford specifically because the naive "sum of squares minus square of sum"
 * shortcut loses catastrophic precision once the mean is large relative to the
 * spread - which is exactly the shape of heart-rate data.
 *
 * POPULATION variance (divide by n), not sample variance (n-1), so that M2 can
 * be reconstructed as variance * sampleCount on the next call. Only the mean,
 * the variance and the count are persisted; M2 is not a column.
 *
 * @param {{ mean?: number, variance?: number, sampleCount?: number } | null} current
 * @param {number[]} values
 * @returns {{ mean: number, variance: number, sampleCount: number, isCalibrated: boolean }}
 */
export const updateBaseline = (current, values) => {
  const clean = (Array.isArray(values) ? values : []).filter((v) => Number.isFinite(v));

  let count = current?.sampleCount ?? 0;
  let mean = current?.mean ?? 0;
  // Rebuild the sum of squared deviations the previous call left behind.
  let m2 = (current?.variance ?? 0) * count;

  for (const value of clean) {
    count += 1;
    const delta = value - mean;
    mean += delta / count;
    // Uses the UPDATED mean - this second delta is what makes Welford stable.
    m2 += delta * (value - mean);
  }

  return {
    mean,
    variance: count > 0 ? m2 / count : 0,
    sampleCount: count,
    isCalibrated: count >= CALIBRATION_MIN_SAMPLES,
  };
};
