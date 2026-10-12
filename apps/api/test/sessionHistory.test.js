import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ABANDONED_AFTER_MS,
  sessionStatus,
  sessionDurationMinutes,
  toSessionHistoryRow,
} from "../src/services/sessionHistory.js";

/**
 * The GET /api/sessions row shape. The guarantee that matters most is the
 * first group: the list was already in use before these fields existed, so
 * every column it returned must still be there, unrenamed.
 */

const NOW = new Date("2026-10-13T12:00:00.000Z");

const baseRow = (overrides = {}) => ({
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  userId: "u1",
  groupId: null,
  inviteCode: null,
  startedAt: new Date("2026-10-13T10:00:00.000Z"),
  endedAt: new Date("2026-10-13T10:45:20.000Z"),
  plannedMinutes: 45,
  focusPoints: 45,
  focusScore: 52,
  focusWeightedMinutes: 23.4,
  completionFactor: 1,
  tasksTotal: 3,
  tasksCompleted: 2,
  hadWatch: false,
  interruptions: [],
  focusRating: null,
  ...overrides,
});

describe("toSessionHistoryRow - additive", () => {
  it("passes every existing column through unchanged", () => {
    const row = baseRow();
    const out = toSessionHistoryRow(row, NOW);
    for (const key of Object.keys(row)) {
      if (key === "interruptions" || key === "focusRating") continue;
      assert.deepEqual(out[key], row[key], `${key} should be unchanged`);
    }
  });

  it("folds the included relations into numbers rather than returning them", () => {
    const out = toSessionHistoryRow(baseRow(), NOW);
    assert.equal("interruptions" in out, false);
    assert.equal("focusRating" in out, false);
  });

  it("keeps a null focusScore null - never 0", () => {
    const out = toSessionHistoryRow(baseRow({ focusScore: null }), NOW);
    assert.equal(out.focusScore, null);
  });
});

describe("toSessionHistoryRow - summary fields", () => {
  it("counts interruptions and totals the time away", () => {
    const out = toSessionHistoryRow(
      baseRow({ interruptions: [{ durationSec: 30 }, { durationSec: 90 }] }),
      NOW,
    );
    assert.equal(out.interruptionCount, 2);
    assert.equal(out.awaySeconds, 120);
  });

  it("reports zero interruptions when there were none", () => {
    const out = toSessionHistoryRow(baseRow(), NOW);
    assert.equal(out.interruptionCount, 0);
    assert.equal(out.awaySeconds, 0);
  });

  it("surfaces the self-rating, and null when unrated", () => {
    assert.equal(
      toSessionHistoryRow(baseRow({ focusRating: { selfRating: 4 } }), NOW).selfRating,
      4,
    );
    assert.equal(toSessionHistoryRow(baseRow(), NOW).selfRating, null);
  });

  it("flags group sessions by groupId", () => {
    assert.equal(toSessionHistoryRow(baseRow(), NOW).isGroup, false);
    assert.equal(
      toSessionHistoryRow(baseRow({ groupId: "g1", inviteCode: "ABC123" }), NOW).isGroup,
      true,
    );
  });

  it("tolerates a row loaded without the relations", () => {
    const { interruptions, focusRating, ...bare } = baseRow();
    const out = toSessionHistoryRow(bare, NOW);
    assert.equal(out.interruptionCount, 0);
    assert.equal(out.selfRating, null);
  });
});

describe("sessionDurationMinutes", () => {
  it("rounds to whole minutes, like endSession", () => {
    assert.equal(sessionDurationMinutes(baseRow()), 45);
  });

  it("is null while the session has no end", () => {
    assert.equal(sessionDurationMinutes(baseRow({ endedAt: null })), null);
  });

  it("floors a clock-skewed negative duration at zero", () => {
    assert.equal(
      sessionDurationMinutes(
        baseRow({
          startedAt: new Date("2026-10-13T10:00:00Z"),
          endedAt: new Date("2026-10-13T09:58:00Z"),
        }),
      ),
      0,
    );
  });

  it("accepts ISO strings as well as Dates", () => {
    assert.equal(
      sessionDurationMinutes({
        startedAt: "2026-10-13T10:00:00.000Z",
        endedAt: "2026-10-13T11:30:00.000Z",
      }),
      90,
    );
  });
});

describe("sessionStatus", () => {
  it("is ended once endedAt is set", () => {
    assert.equal(sessionStatus(baseRow(), NOW), "ended");
  });

  it("is active while open and recent", () => {
    assert.equal(
      sessionStatus(baseRow({ endedAt: null, startedAt: new Date(NOW.getTime() - 60_000) }), NOW),
      "active",
    );
  });

  it("is abandoned once open for the cutoff or longer", () => {
    assert.equal(
      sessionStatus(
        baseRow({ endedAt: null, startedAt: new Date(NOW.getTime() - ABANDONED_AFTER_MS) }),
        NOW,
      ),
      "abandoned",
    );
  });

  it("an old session that DID end is ended, not abandoned", () => {
    assert.equal(
      sessionStatus(
        baseRow({ startedAt: new Date("2026-01-01T10:00:00Z"), endedAt: new Date("2026-01-01T11:00:00Z") }),
        NOW,
      ),
      "ended",
    );
  });
});
