import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summariseFocusEstimate, focusScoreChange } from "../src/services/analyticsFocus.js";

/**
 * Tests for the focus-estimate and task numbers on the analytics screen.
 *
 * Pure functions only, like focusScoring.test.js - no database, no server.
 */

const MINUTE = 60_000;

/** One in-range entry, shaped as analytics.service.js builds them. */
const entry = (minutes, session = {}) => ({
  ms: minutes * MINUTE,
  session: {
    focusScore: null,
    focusWeightedMinutes: null,
    tasksTotal: null,
    tasksCompleted: null,
    ...session,
  },
});

describe("summariseFocusEstimate", () => {
  it("returns nulls, never zeros, when there is nothing to measure", () => {
    assert.deepEqual(summariseFocusEstimate([]), {
      averageFocusScore: null,
      scoredSessionCount: 0,
      focusWeightedMinutes: null,
      tasksCompleted: 0,
      tasksTotal: 0,
      taskCompletionPercent: null,
    });
  });

  it("skips unscored sessions rather than averaging them in as 0", () => {
    const result = summariseFocusEstimate([
      entry(60, { focusScore: 80 }),
      entry(60), // never measured
    ]);
    assert.equal(result.averageFocusScore, 80);
    assert.equal(result.scoredSessionCount, 1);
  });

  it("keeps a measured score of 0 as a real result", () => {
    const result = summariseFocusEstimate([entry(30, { focusScore: 0 })]);
    assert.equal(result.averageFocusScore, 0);
    assert.equal(result.scoredSessionCount, 1);
  });

  it("weights the average by session duration", () => {
    // 120 min at 80 and 5 min at 20: (80*120 + 20*5) / 125 = 77.6
    const result = summariseFocusEstimate([
      entry(120, { focusScore: 80 }),
      entry(5, { focusScore: 20 }),
    ]);
    assert.equal(result.averageFocusScore, 78);
  });

  it("falls back to the plain mean when every scored session has zero length", () => {
    const result = summariseFocusEstimate([
      entry(0, { focusScore: 40 }),
      entry(0, { focusScore: 61 }),
    ]);
    assert.equal(result.averageFocusScore, 51);
  });

  it("treats a negative duration as zero weight", () => {
    const result = summariseFocusEstimate([
      entry(-10, { focusScore: 10 }),
      entry(30, { focusScore: 90 }),
    ]);
    assert.equal(result.averageFocusScore, 90);
  });

  it("sums focus-weighted minutes over sessions that have them, rounded once", () => {
    const result = summariseFocusEstimate([
      entry(60, { focusScore: 50, focusWeightedMinutes: 30.4 }),
      entry(10, { focusScore: 51, focusWeightedMinutes: 5.1 }),
      entry(10),
    ]);
    assert.equal(result.focusWeightedMinutes, 36);
  });

  it("totals tasks only across sessions that had a checklist", () => {
    const result = summariseFocusEstimate([
      entry(30, { tasksTotal: 4, tasksCompleted: 3 }),
      entry(30, { tasksTotal: 0, tasksCompleted: 0 }),
      entry(30), // no checklist
      entry(30, { tasksTotal: 21, tasksCompleted: 14 }),
    ]);
    assert.equal(result.tasksTotal, 25);
    assert.equal(result.tasksCompleted, 17);
    assert.equal(result.taskCompletionPercent, 68);
  });

  it("counts tasks independently of whether the session was scored", () => {
    const result = summariseFocusEstimate([entry(30, { tasksTotal: 2, tasksCompleted: 2 })]);
    assert.equal(result.averageFocusScore, null);
    assert.equal(result.taskCompletionPercent, 100);
  });

  it("never reports more tasks done than there were", () => {
    const result = summariseFocusEstimate([entry(30, { tasksTotal: 2, tasksCompleted: 5 })]);
    assert.equal(result.tasksCompleted, 2);
    assert.equal(result.taskCompletionPercent, 100);
  });
});

describe("focusScoreChange", () => {
  it("is the difference in points", () => {
    assert.equal(focusScoreChange(72, 60), 12);
    assert.equal(focusScoreChange(55, 70), -15);
    assert.equal(focusScoreChange(0, 0), 0);
  });

  it("is null when either period has no scored session", () => {
    assert.equal(focusScoreChange(72, null), null);
    assert.equal(focusScoreChange(null, 60), null);
    assert.equal(focusScoreChange(null, null), null);
  });
});
