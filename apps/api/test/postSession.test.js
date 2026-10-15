import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  HIGHLIGHTS,
  PHONE_FREE_MIN_MINUTES,
  toHighlights,
  toViewerSession,
} from "../src/services/postSession.js";

/**
 * The badges a post shows. Most of these tests are about when a badge must NOT
 * appear - a badge nobody earned is worse than no badge at all.
 */

const AUTHOR = "author";
const START = new Date("2026-10-15T09:00:00Z");
const minutesAfterStart = (minutes) => new Date(START.getTime() + minutes * 60000);

/** A finished, measured 60-minute session with nothing special about it. */
const baseSession = (overrides = {}) => ({
  startedAt: START,
  endedAt: minutesAfterStart(60),
  focusPoints: 60,
  tasksTotal: null,
  tasksCompleted: null,
  focusScore: 70,
  plannedMinutes: null,
  _count: { interruptions: 2 },
  participants: [],
  hostSession: null,
  ...overrides,
});

describe("toHighlights", () => {
  it("earns nothing for an unremarkable session", () => {
    assert.deepEqual(toHighlights(baseSession(), false), []);
  });

  it("earns nothing while the session is still running", () => {
    const running = baseSession({
      endedAt: null,
      plannedMinutes: 25,
      _count: { interruptions: 0 },
    });
    assert.deepEqual(toHighlights(running, true), []);
  });

  it("passes PERSONAL_BEST through from the page query", () => {
    assert.deepEqual(toHighlights(baseSession(), true), ["PERSONAL_BEST"]);
  });

  describe("HIT_PLAN", () => {
    it("is earned at or past the planned minutes", () => {
      assert.deepEqual(toHighlights(baseSession({ plannedMinutes: 60 }), false), ["HIT_PLAN"]);
      assert.deepEqual(toHighlights(baseSession({ plannedMinutes: 45 }), false), ["HIT_PLAN"]);
    });

    it("is not earned short of the plan, or with no plan", () => {
      assert.deepEqual(toHighlights(baseSession({ plannedMinutes: 90 }), false), []);
      assert.deepEqual(toHighlights(baseSession({ plannedMinutes: null }), false), []);
    });
  });

  describe("PHONE_FREE", () => {
    const phoneFree = (overrides) =>
      toHighlights(baseSession({ _count: { interruptions: 0 }, ...overrides }), false);

    it("is earned by a measured session long enough to mean something", () => {
      assert.deepEqual(phoneFree({}), ["PHONE_FREE"]);
    });

    it("is not earned with any phone interruption", () => {
      assert.deepEqual(toHighlights(baseSession({ _count: { interruptions: 1 } }), false), []);
    });

    it("is not earned without a focus estimate - zero interruptions there means unmeasured", () => {
      assert.deepEqual(phoneFree({ focusScore: null }), []);
    });

    it(`is not earned under ${PHONE_FREE_MIN_MINUTES} minutes`, () => {
      assert.deepEqual(phoneFree({ endedAt: minutesAfterStart(PHONE_FREE_MIN_MINUTES - 1) }), []);
      assert.deepEqual(phoneFree({ endedAt: minutesAfterStart(PHONE_FREE_MIN_MINUTES) }), [
        "PHONE_FREE",
      ]);
    });
  });

  it("lists everything earned in HIGHLIGHTS order", () => {
    const everything = baseSession({ plannedMinutes: 30, _count: { interruptions: 0 } });
    assert.deepEqual(toHighlights(everything, true), HIGHLIGHTS);
  });
});

describe("toViewerSession", () => {
  it("passes null through - a post with no session", () => {
    assert.equal(toViewerSession(null, AUTHOR), null);
  });

  it("keeps the numbers, adds studiedWith and highlights, and drops the join shapes", () => {
    const out = toViewerSession(
      baseSession({ tasksTotal: 5, tasksCompleted: 4, plannedMinutes: 50 }),
      AUTHOR,
      { isPersonalBest: true },
    );

    assert.equal(out.focusScore, 70);
    assert.equal(out.plannedMinutes, 50);
    assert.equal(out.tasksCompleted, 4);
    assert.deepEqual(out.studiedWith, []);
    assert.deepEqual(out.highlights, ["PERSONAL_BEST", "HIT_PLAN"]);
    for (const key of ["participants", "hostSession", "_count"]) {
      assert.equal(key in out, false, `${key} must not reach the wire`);
    }
  });
});
