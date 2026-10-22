import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  activeMs,
  activeMinutes,
  openPauseSeconds,
  pausedSecondsAt,
  toPauseState,
  isTimeAway,
  MAX_PAUSES,
  MAX_PAUSE_SEC,
} from "../src/services/sessionPause.js";
import { computeAwayFraction } from "../src/services/focusScoring.js";
import { toSessionHistoryRow } from "../src/services/sessionHistory.js";

/**
 * A break takes time out of a session, never more than five minutes of it at
 * a time, and three times at most. Every duration in the app comes from
 * activeMs, so these are the cases that decide how long anyone studied.
 */

const T0 = new Date("2026-10-16T09:00:00Z");
const at = (minutes, seconds = 0) => new Date(T0.getTime() + minutes * 60_000 + seconds * 1000);

describe("openPauseSeconds", () => {
  it("is zero with no break open", () => {
    assert.equal(openPauseSeconds(null, at(10)), 0);
  });

  it("counts a break as it runs", () => {
    assert.equal(openPauseSeconds(at(10), at(12, 30)), 150);
  });

  it("stops counting at five minutes, however long the break really ran", () => {
    assert.equal(openPauseSeconds(at(10), at(25)), MAX_PAUSE_SEC);
  });

  it("never goes negative when the clocks disagree", () => {
    assert.equal(openPauseSeconds(at(10), at(9)), 0);
  });
});

describe("pausedSecondsAt", () => {
  it("adds the open break to what earlier breaks banked", () => {
    assert.equal(pausedSecondsAt({ pausedSeconds: 200, pausedAt: at(30) }, at(31)), 260);
  });

  it("treats a missing count as none", () => {
    assert.equal(pausedSecondsAt({}, at(5)), 0);
  });
});

describe("activeMs", () => {
  it("is the wall clock for a session with no breaks", () => {
    assert.equal(activeMs({ startedAt: T0, endedAt: at(45) }), 45 * 60_000);
  });

  it("takes finished breaks out", () => {
    const session = { startedAt: T0, endedAt: at(60), pausedSeconds: 420 };
    assert.equal(activeMs(session), 53 * 60_000);
  });

  it("takes out a break still open at the end, capped", () => {
    // Ended 20 minutes into a break: only five of them were a break.
    const session = { startedAt: T0, endedAt: at(60), pausedAt: at(40), pausedSeconds: 0 };
    assert.equal(activeMs(session), 55 * 60_000);
  });

  it("measures a running session against a given moment", () => {
    const running = { startedAt: T0, endedAt: null, pausedSeconds: 60 };
    assert.equal(activeMs(running, at(10)), 9 * 60_000);
    assert.equal(activeMs(running), 0, "no end and no moment means no duration yet");
  });

  it("is never negative", () => {
    assert.equal(activeMs({ startedAt: at(10), endedAt: T0 }), 0);
    assert.equal(activeMs({ startedAt: T0, endedAt: at(1), pausedSeconds: 300 }), 0);
  });
});

describe("activeMinutes", () => {
  it("rounds to whole minutes, as minutesStudied always has", () => {
    assert.equal(activeMinutes({ startedAt: T0, endedAt: at(30, 40), pausedSeconds: 0 }), 31);
    assert.equal(activeMinutes({ startedAt: T0, endedAt: at(30, 40), pausedSeconds: 60 }), 30);
  });
});

describe("toPauseState", () => {
  it("describes a session with all its breaks to come", () => {
    const state = toPauseState({ pausedAt: null, pauseCount: 0, pausedSeconds: 0 }, at(5));
    assert.equal(state.isPaused, false);
    assert.equal(state.pausesLeft, MAX_PAUSES);
    assert.equal(state.pauseEndsAt, null);
    assert.equal(state.maxPauseSec, MAX_PAUSE_SEC);
  });

  it("says when the open break stops counting", () => {
    const state = toPauseState({ pausedAt: at(20), pauseCount: 2, pausedSeconds: 90 }, at(21));
    assert.equal(state.isPaused, true);
    assert.equal(state.pausesLeft, 1);
    assert.equal(state.pauseEndsAt.toISOString(), at(25).toISOString());
    assert.equal(state.pausedSeconds, 150);
  });

  it("never reports fewer than zero breaks left", () => {
    assert.equal(toPauseState({ pauseCount: 7 }).pausesLeft, 0);
  });
});

describe("isTimeAway", () => {
  it("counts trips out of the app, typed or not, and not breaks", () => {
    assert.equal(isTimeAway({ type: "APP_EXIT" }), true);
    assert.equal(isTimeAway({ type: null }), true);
    assert.equal(isTimeAway({}), true);
    assert.equal(isTimeAway({ type: "BREAK" }), false);
  });

  it("keeps a break out of the away fraction the score uses", () => {
    const HOUR = 60 * 60_000;
    const away = [{ durationSec: 900, type: "APP_EXIT" }];
    const withBreak = [...away, { durationSec: 300, type: "BREAK" }];
    assert.equal(computeAwayFraction(withBreak, HOUR), computeAwayFraction(away, HOUR));
  });

  it("keeps a break out of a history row's time away", () => {
    const row = toSessionHistoryRow({
      id: "s",
      startedAt: T0,
      endedAt: at(60),
      pausedSeconds: 300,
      groupId: null,
      interruptions: [
        { durationSec: 120, type: "APP_EXIT" },
        { durationSec: 300, type: "BREAK" },
      ],
      focusRating: null,
    });
    assert.equal(row.awaySeconds, 120);
    assert.equal(row.interruptionCount, 1);
    assert.equal(row.durationMinutes, 55);
  });
});
