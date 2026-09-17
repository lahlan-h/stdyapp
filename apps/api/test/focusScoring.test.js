import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  clamp01,
  zScore,
  resolveBaseline,
  scoreMotion,
  scorePresence,
  scoreHeartRate,
  scoreSample,
  computeCompletionFactor,
  scoreSession,
  updateBaseline,
  SIGNAL_WEIGHTS,
  POPULATION_BASELINES,
  CALIBRATION_MIN_SAMPLES,
  SAMPLE_WEIGHT,
  COMPLETION_WEIGHT,
} from "../src/services/focusScoring.js";

/**
 * Tests for the focus estimate's arithmetic.
 *
 * Every case here runs against pure functions - no database, no server, no
 * fixtures, no mocking library. That is the whole reason the scoring lives in
 * its own I/O-free module.
 */

/** Floating-point comparison. Never assert.equal() on computed floats. */
const closeTo = (actual, expected, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );

const MINUTE = 60_000;
const START = new Date("2026-09-01T09:00:00.000Z");
const at = (minutes) => new Date(START.getTime() + minutes * MINUTE);

/** A sample sitting exactly on the population motion mean, so motion === 0.5. */
const typicalSample = (overrides = {}) => ({
  timestamp: START,
  motionVariance: POPULATION_BASELINES.MOTION.mean,
  inApp: true,
  ...overrides,
});

describe("clamp01", () => {
  it("confines any input to [0, 1]", () => {
    assert.equal(clamp01(-5), 0);
    assert.equal(clamp01(0), 0);
    assert.equal(clamp01(0.42), 0.42);
    assert.equal(clamp01(1), 1);
    assert.equal(clamp01(9999), 1);
  });
});

describe("zScore", () => {
  it("standardises a reading against its baseline", () => {
    closeTo(zScore(12, { mean: 10, standardDeviation: 2 }), 1);
    closeTo(zScore(6, { mean: 10, standardDeviation: 2 }), -2);
    closeTo(zScore(10, { mean: 10, standardDeviation: 2 }), 0);
  });

  it("returns 0 rather than dividing by a degenerate spread", () => {
    // The bug this guards against is a NaN leaking all the way to a stored
    // focusScore, where it would silently poison the leaderboard.
    const z = zScore(42, { mean: 10, standardDeviation: 0 });
    assert.equal(z, 0);
    assert.ok(Number.isFinite(z));
  });
});

describe("resolveBaseline", () => {
  const fallback = { mean: 100, variance: 25 };

  it("uses a personal baseline once it is calibrated", () => {
    const result = resolveBaseline(
      { mean: 50, variance: 4, sampleCount: 200, isCalibrated: true },
      fallback,
    );
    assert.equal(result.usedBaseline, true);
    assert.equal(result.mean, 50);
    closeTo(result.standardDeviation, 2);
  });

  it("falls back to the population default when not yet calibrated", () => {
    // A baseline built from three samples has a tiny arbitrary variance, which
    // would make every later z-score enormous. Better to look like everyone
    // else until there is real evidence.
    const result = resolveBaseline(
      { mean: 50, variance: 4, sampleCount: 3, isCalibrated: false },
      fallback,
    );
    assert.equal(result.usedBaseline, false);
    assert.equal(result.mean, fallback.mean);
    closeTo(result.standardDeviation, 5);
  });

  it("falls back when the baseline has collapsed to zero variance", () => {
    const result = resolveBaseline(
      { mean: 50, variance: 0, sampleCount: 999, isCalibrated: true },
      fallback,
    );
    assert.equal(result.usedBaseline, false);
    assert.equal(result.mean, fallback.mean);
  });

  it("falls back when there is no baseline at all", () => {
    assert.equal(resolveBaseline(null, fallback).usedBaseline, false);
    assert.equal(resolveBaseline(undefined, fallback).usedBaseline, false);
  });
});

describe("scoreMotion", () => {
  it("scores a perfectly typical reading at the midpoint", () => {
    closeTo(scoreMotion(POPULATION_BASELINES.MOTION.mean, null), 0.5);
  });

  it("rewards stillness and penalises movement, asymmetrically", () => {
    const still = scoreMotion(0, null);
    const typical = scoreMotion(POPULATION_BASELINES.MOTION.mean, null);
    const restless = scoreMotion(5, null);

    assert.ok(still > typical, "unusually still should beat typical");
    assert.ok(restless < typical, "unusually restless should trail typical");
    assert.ok(still <= 1 && restless >= 0);
  });

  it("stays finite and in range for absurd readings", () => {
    for (const value of [0, 1e-12, 1e6, Number.MAX_SAFE_INTEGER]) {
      const score = scoreMotion(value, null);
      assert.ok(Number.isFinite(score), `NaN/Infinity for ${value}`);
      assert.ok(score >= 0 && score <= 1, `out of range for ${value}`);
    }
  });

  it("never produces NaN against a zero-variance baseline", () => {
    const score = scoreMotion(0.9, {
      mean: 0.4,
      variance: 0,
      sampleCount: 500,
      isCalibrated: true,
    });
    assert.ok(Number.isFinite(score));
    assert.ok(score >= 0 && score <= 1);
  });
});

describe("scorePresence", () => {
  it("is absolute, not relative to the user's own habits", () => {
    // Deliberately not z-scored: baselining presence would credit a habitually
    // distracted user for being distracted at their usual rate.
    assert.equal(scorePresence(true), 1);
    assert.equal(scorePresence(false), 0);
  });
});

describe("scoreHeartRate", () => {
  it("peaks at the user's own typical rate", () => {
    closeTo(scoreHeartRate(POPULATION_BASELINES.HEART_RATE.mean, null), 1);
  });

  it("treats deviation in either direction as unsteady", () => {
    const { mean, variance } = POPULATION_BASELINES.HEART_RATE;
    const sd = Math.sqrt(variance);

    const above = scoreHeartRate(mean + sd, null);
    const below = scoreHeartRate(mean - sd, null);

    closeTo(above, below, 1e-12);
    assert.ok(above < 1, "one sigma out should score below the peak");
  });

  it("never produces NaN against a zero-variance baseline", () => {
    const score = scoreHeartRate(88, {
      mean: 70,
      variance: 0,
      sampleCount: 500,
      isCalibrated: true,
    });
    assert.ok(Number.isFinite(score));
    assert.ok(score >= 0 && score <= 1);
  });
});

describe("scoreSample", () => {
  it("weights the present signals and reports each one", () => {
    const result = scoreSample(typicalSample());

    closeTo(result.motion, 0.5);
    assert.equal(result.presence, 1);
    assert.equal(result.heartRate, null, "no hr means no heart-rate score");

    const expected =
      (0.5 * SIGNAL_WEIGHTS.MOTION + 1 * SIGNAL_WEIGHTS.PRESENCE) /
      (SIGNAL_WEIGHTS.MOTION + SIGNAL_WEIGHTS.PRESENCE);
    closeTo(result.composite, expected);
  });

  it("redistributes heart-rate weight instead of scoring it zero", () => {
    // The regression this guards: treating a missing signal as 0 would punish
    // every user without an Apple Watch, which is nearly all of them.
    const withoutWatch = scoreSample(typicalSample()).composite;

    const asIfZero =
      (0.5 * SIGNAL_WEIGHTS.MOTION +
        1 * SIGNAL_WEIGHTS.PRESENCE +
        0 * SIGNAL_WEIGHTS.HEART_RATE) /
      (SIGNAL_WEIGHTS.MOTION + SIGNAL_WEIGHTS.PRESENCE + SIGNAL_WEIGHTS.HEART_RATE);

    assert.ok(
      withoutWatch > asIfZero,
      `watch-free score ${withoutWatch} must beat the score-as-zero ${asIfZero}`,
    );
  });

  it("includes heart rate when it is present", () => {
    const result = scoreSample(
      typicalSample({ hr: POPULATION_BASELINES.HEART_RATE.mean }),
    );

    closeTo(result.heartRate, 1);

    const expected =
      0.5 * SIGNAL_WEIGHTS.MOTION +
      1 * SIGNAL_WEIGHTS.PRESENCE +
      1 * SIGNAL_WEIGHTS.HEART_RATE;
    closeTo(result.composite, expected);
  });

  it("scores an entirely distracted sample at zero", () => {
    const result = scoreSample({ motionVariance: 1e6, inApp: false });
    assert.equal(result.presence, 0);
    closeTo(result.composite, 0, 1e-6);
  });
});

describe("computeCompletionFactor", () => {
  const base = { startedAt: START, endedAt: at(60) };

  it("is 1 when sampling spans the whole session", () => {
    const factor = computeCompletionFactor({
      ...base,
      samples: [{ timestamp: START }, { timestamp: at(60) }],
    });
    closeTo(factor, 1);
  });

  it("is 0.5 when sampling stops halfway - the abandoned session", () => {
    const factor = computeCompletionFactor({
      ...base,
      samples: [{ timestamp: START }, { timestamp: at(30) }],
    });
    closeTo(factor, 0.5);
  });

  it("is 0 when there are fewer than two samples", () => {
    assert.equal(computeCompletionFactor({ ...base, samples: [] }), 0);
    assert.equal(
      computeCompletionFactor({ ...base, samples: [{ timestamp: START }] }),
      0,
    );
  });

  it("is 0 for a zero-length session rather than dividing by zero", () => {
    const factor = computeCompletionFactor({
      startedAt: START,
      endedAt: START,
      samples: [{ timestamp: START }, { timestamp: START }],
    });
    assert.ok(Number.isFinite(factor));
    assert.equal(factor, 0);
  });

  it("does not exceed 1 when samples fall outside the window", () => {
    const factor = computeCompletionFactor({
      ...base,
      samples: [{ timestamp: at(-500) }, { timestamp: at(900) }],
    });
    assert.equal(factor, 1);
  });
});

describe("scoreSession", () => {
  it("returns nulls - not zeros - when there is nothing to score", () => {
    // "We never measured this" and "we measured it and it was terrible" are
    // different facts. Collapsing them would libel every user whose client
    // failed to report samples.
    const result = scoreSession({ samples: [], startedAt: START, endedAt: at(60) });

    assert.equal(result.focusScore, null);
    assert.equal(result.focusWeightedMinutes, null);
    assert.equal(result.completionFactor, null);
    assert.equal(result.sampleCount, 0);
    assert.equal(result.hadWatch, false);
  });

  it("computes a hand-checkable score", () => {
    // Two typical samples spanning the full hour:
    //   motion   = 0.5  (exactly the population mean)
    //   presence = 1
    //   composite = (0.5*0.35 + 1*0.45) / 0.80 = 0.78125
    //   completion = 1
    //   blended  = 0.85*0.78125 + 0.15*1 = 0.8140625  -> 81
    const result = scoreSession({
      samples: [typicalSample(), typicalSample({ timestamp: at(60) })],
      startedAt: START,
      endedAt: at(60),
    });

    const composite =
      (0.5 * SIGNAL_WEIGHTS.MOTION + SIGNAL_WEIGHTS.PRESENCE) /
      (SIGNAL_WEIGHTS.MOTION + SIGNAL_WEIGHTS.PRESENCE);
    const blended = SAMPLE_WEIGHT * composite + COMPLETION_WEIGHT * 1;

    assert.equal(result.focusScore, Math.round(blended * 100));
    assert.equal(result.focusScore, 81);
    closeTo(result.completionFactor, 1);
    assert.equal(result.sampleCount, 2);
  });

  it("keeps weighted minutes reconciled with the score the user was shown", () => {
    // The invariant: weighted = elapsed minutes x (score / 100). At a score of
    // 50, an hour of study is worth 30 focus-weighted minutes.
    const result = scoreSession({
      samples: [typicalSample(), typicalSample({ timestamp: at(60) })],
      startedAt: START,
      endedAt: at(60),
    });

    closeTo(result.focusWeightedMinutes, 60 * (result.focusScore / 100));
    closeTo(60 * (50 / 100), 30);
  });

  it("stays within 0-100 for the best and worst possible sessions", () => {
    const worst = scoreSession({
      samples: [
        { timestamp: START, motionVariance: 1e9, inApp: false },
        { timestamp: START, motionVariance: 1e9, inApp: false },
      ],
      startedAt: START,
      endedAt: at(60),
    });

    const best = scoreSession({
      samples: [
        { timestamp: START, motionVariance: 0, inApp: true, hr: 72 },
        { timestamp: at(60), motionVariance: 0, inApp: true, hr: 72 },
      ],
      startedAt: START,
      endedAt: at(60),
    });

    for (const [label, result] of [["worst", worst], ["best", best]]) {
      assert.ok(Number.isFinite(result.focusScore), `${label} produced a non-number`);
      assert.ok(
        result.focusScore >= 0 && result.focusScore <= 100,
        `${label} scored ${result.focusScore}, outside 0-100`,
      );
      assert.ok(Number.isInteger(result.focusScore), `${label} score is not an integer`);
    }

    assert.equal(worst.focusScore, 0);
    assert.ok(best.focusScore > worst.focusScore);
  });

  it("flags a watch when any sample carried a heart rate", () => {
    const partial = scoreSession({
      samples: [typicalSample(), typicalSample({ timestamp: at(60), hr: 70 })],
      startedAt: START,
      endedAt: at(60),
    });
    assert.equal(partial.hadWatch, true);

    const none = scoreSession({
      samples: [typicalSample(), typicalSample({ timestamp: at(60) })],
      startedAt: START,
      endedAt: at(60),
    });
    assert.equal(none.hadWatch, false);
  });

  it("never produces NaN from a zero-variance personal baseline", () => {
    const result = scoreSession({
      samples: [typicalSample(), typicalSample({ timestamp: at(60), hr: 80 })],
      startedAt: START,
      endedAt: at(60),
      baselines: {
        MOTION: { mean: 0.4, variance: 0, sampleCount: 900, isCalibrated: true },
        HEART_RATE: { mean: 70, variance: 0, sampleCount: 900, isCalibrated: true },
      },
    });

    assert.ok(Number.isFinite(result.focusScore));
    assert.ok(Number.isFinite(result.focusWeightedMinutes));
  });
});

describe("updateBaseline", () => {
  it("converges on the true mean and variance across batches", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Split across two calls, as two sessions would arrive.
    const first = updateBaseline(null, values.slice(0, 4));
    const second = updateBaseline(first, values.slice(4));

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

    assert.equal(second.sampleCount, 10);
    closeTo(second.mean, mean, 1e-9);
    closeTo(second.variance, variance, 1e-9);
    closeTo(second.mean, 5.5, 1e-9);
    closeTo(second.variance, 8.25, 1e-9);
  });

  it("matches a single-batch update regardless of how it is split", () => {
    const values = [12, 40, 7, 33, 21, 19, 88, 4];

    const oneGo = updateBaseline(null, values);
    const piecemeal = values.reduce((acc, v) => updateBaseline(acc, [v]), null);

    closeTo(piecemeal.mean, oneGo.mean, 1e-9);
    closeTo(piecemeal.variance, oneGo.variance, 1e-9);
    assert.equal(piecemeal.sampleCount, oneGo.sampleCount);
  });

  it("flips isCalibrated exactly at the threshold", () => {
    const below = updateBaseline(null, Array(CALIBRATION_MIN_SAMPLES - 1).fill(5));
    assert.equal(below.isCalibrated, false);

    const atThreshold = updateBaseline(below, [5]);
    assert.equal(atThreshold.sampleCount, CALIBRATION_MIN_SAMPLES);
    assert.equal(atThreshold.isCalibrated, true);
  });

  it("ignores non-numeric readings rather than poisoning the baseline", () => {
    // A dropped watch reading arriving as null must not turn the whole
    // baseline into NaN for every future session.
    const result = updateBaseline(null, [10, null, 20, undefined, NaN, 30]);

    assert.equal(result.sampleCount, 3);
    closeTo(result.mean, 20);
    assert.ok(Number.isFinite(result.variance));
  });

  it("handles an empty batch without disturbing the existing baseline", () => {
    const existing = updateBaseline(null, [4, 8, 12]);
    const unchanged = updateBaseline(existing, []);

    assert.equal(unchanged.sampleCount, existing.sampleCount);
    closeTo(unchanged.mean, existing.mean);
    closeTo(unchanged.variance, existing.variance);
  });

  it("reports zero variance for a single reading without producing NaN", () => {
    const result = updateBaseline(null, [42]);
    assert.equal(result.sampleCount, 1);
    closeTo(result.mean, 42);
    assert.equal(result.variance, 0);
    assert.ok(Number.isFinite(result.variance));
  });
});
