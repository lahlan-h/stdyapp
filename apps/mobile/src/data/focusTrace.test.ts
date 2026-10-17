import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFocusTimeline, interruptionsToSpells, traceAxisLabels } from "./focusTrace.ts";

/**
 * The focus chart's timeline: every 15 seconds of a session is focus, time
 * away, phone-down or a break, and the average counts only what the score
 * counts. Run with `npm test -w @stdyapp/mobile`.
 */

const T0 = 1_700_000_000_000;
const s = (seconds: number) => T0 + seconds * 1000;
const sample = (seconds: number, computedFocus = 0.8) => ({ timestamp: s(seconds), computedFocus });

describe("buildFocusTimeline", () => {
  it("is one focus bar per sample when nothing is missing", () => {
    const timeline = buildFocusTimeline({
      samples: [sample(0), sample(15), sample(30)],
      startedAtMs: s(0),
      endedAtMs: s(40),
    });
    assert.deepEqual(
      timeline.segments.map((seg) => seg.kind),
      ["focus", "focus", "focus"],
    );
    assert.equal(timeline.average, 80);
  });

  it("draws a break begun part-way into a slot as a break, not time away", () => {
    // Sampled at 0; a break from 10s to 28s skipped the sample due at 15;
    // sampling resumed at 30. The missing slot is the break's.
    const timeline = buildFocusTimeline({
      samples: [sample(0), sample(30)],
      startedAtMs: s(0),
      endedAtMs: s(35),
      breakSpells: [{ endMs: s(28), durationSec: 18 }],
    });
    assert.deepEqual(
      timeline.segments.map((seg) => seg.kind),
      ["focus", "break", "focus"],
    );
    assert.equal(timeline.breakSec, 18);
    assert.equal(timeline.average, 80, "a break counts for nothing either way");
  });

  it("still draws a gap with no break behind it as time away", () => {
    const timeline = buildFocusTimeline({
      samples: [sample(0), sample(30)],
      startedAtMs: s(0),
      endedAtMs: s(35),
    });
    assert.deepEqual(
      timeline.segments.map((seg) => seg.kind),
      ["focus", "away", "focus"],
    );
    assert.equal(timeline.average, 53, "time away counts as zero");
  });

  it("keeps a trip away after a break as time away", () => {
    // A 30-second break, then a minute in another app before the next sample.
    const timeline = buildFocusTimeline({
      samples: [sample(0), sample(105)],
      startedAtMs: s(0),
      endedAtMs: s(110),
      breakSpells: [{ endMs: s(35), durationSec: 30 }],
      awaySpells: [{ endMs: s(100), durationSec: 60 }],
    });
    const kinds = timeline.segments.map((seg) => seg.kind);
    assert.ok(kinds.includes("break"));
    assert.ok(kinds.includes("away"));
    assert.equal(kinds.filter((kind) => kind === "break").length, 2);
  });
});

describe("interruptionsToSpells", () => {
  const rows = [
    { startedAt: s(60), durationSec: 30, type: "APP_EXIT" },
    { startedAt: s(200), durationSec: 120, type: "BREAK" },
    { startedAt: s(400), durationSec: 20 },
  ];

  it("reads trips away - typed or not - as away, and leaves breaks out", () => {
    assert.deepEqual(interruptionsToSpells(rows), [
      { endMs: s(60), durationSec: 30 },
      { endMs: s(400), durationSec: 20 },
    ]);
  });

  it("reads only breaks when asked for breaks", () => {
    assert.deepEqual(interruptionsToSpells(rows, "break"), [{ endMs: s(200), durationSec: 120 }]);
  });
});

describe("traceAxisLabels", () => {
  it("never prints the same mark twice, even for a few seconds", () => {
    assert.deepEqual(traceAxisLabels(3), ["0s", "0.8s", "1.5s", "2.3s", "3s"]);
    for (const total of [1, 2, 3, 5, 7, 9, 10, 11, 59, 90, 299, 300, 301, 3600, 7200]) {
      const labels = traceAxisLabels(total);
      assert.equal(new Set(labels).size, labels.length, `${total}s: ${labels.join(" ")}`);
    }
  });

  it("counts in seconds under five minutes, and minutes from there", () => {
    assert.deepEqual(traceAxisLabels(90), ["0s", "23s", "45s", "68s", "90s"]);
    assert.deepEqual(traceAxisLabels(600), ["0m", "3m", "5m", "8m", "10m"]);
  });

  it("reads an hour or more in hours and minutes", () => {
    assert.deepEqual(traceAxisLabels(7200), ["0m", "30m", "1h", "1h 30m", "2h"]);
  });
});
