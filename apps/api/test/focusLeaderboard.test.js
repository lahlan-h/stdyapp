import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  METRICS,
  MIN_SCORED_SESSIONS,
  minSessionsFor,
  audienceIds,
  rankRows,
  roundValue,
  toDisplayName,
  toEntry,
  buildMe,
} from "../src/services/focusLeaderboard.js";
import { LEADERBOARD_METRICS } from "../src/validation/focus.validation.js";

/**
 * The leaderboard is a social surface, so its mistakes are public: a wrong
 * rank, a stranger on a friends-only board, or one lucky session at the top of
 * the focus board. Everything that decides those lives in focusLeaderboard.js
 * and is tested here without a database.
 */

describe("METRICS", () => {
  it("matches the values the validation layer accepts", () => {
    assert.deepEqual(Object.values(METRICS).sort(), [...LEADERBOARD_METRICS].sort());
  });
});

describe("minSessionsFor", () => {
  it("only the average focus estimate has a floor above one session", () => {
    assert.equal(minSessionsFor(METRICS.FOCUS_SCORE), MIN_SCORED_SESSIONS);
    assert.equal(minSessionsFor(METRICS.WEIGHTED_MINUTES), 1);
    assert.equal(minSessionsFor(METRICS.TASKS_COMPLETED), 1);
  });

  it("the floor is more than one, or it would not stop a single lucky session", () => {
    assert.ok(MIN_SCORED_SESSIONS > 1);
  });
});

describe("audienceIds", () => {
  it("is the people followed plus the caller", () => {
    assert.deepEqual(audienceIds("me", ["a", "b"], []).sort(), ["a", "b", "me"]);
  });

  it("includes the caller even when they follow nobody", () => {
    assert.deepEqual(audienceIds("me", [], []), ["me"]);
  });

  it("drops anyone on either side of a block", () => {
    assert.deepEqual(audienceIds("me", ["a", "b"], ["b"]).sort(), ["a", "me"]);
  });

  it("never drops the caller, and never lists them twice", () => {
    assert.deepEqual(audienceIds("me", ["me", "a"], ["me"]).sort(), ["a", "me"]);
  });
});

describe("rankRows", () => {
  it("ranks biggest first", () => {
    const ranked = rankRows(
      [
        { userId: "a", value: 30, sessions: 1 },
        { userId: "b", value: 90, sessions: 2 },
        { userId: "c", value: 60, sessions: 1 },
      ],
      METRICS.WEIGHTED_MINUTES,
    );
    assert.deepEqual(
      ranked.map((r) => [r.userId, r.rank]),
      [
        ["b", 1],
        ["c", 2],
        ["a", 3],
      ],
    );
  });

  it("gives ties the same rank and skips the places they share (1, 2, 2, 4)", () => {
    const ranked = rankRows(
      [
        { userId: "d", value: 10, sessions: 1 },
        { userId: "c", value: 50, sessions: 1 },
        { userId: "b", value: 50, sessions: 1 },
        { userId: "a", value: 80, sessions: 1 },
      ],
      METRICS.TASKS_COMPLETED,
    );
    assert.deepEqual(
      ranked.map((r) => [r.userId, r.rank]),
      [
        ["a", 1],
        ["b", 2],
        ["c", 2],
        ["d", 4],
      ],
    );
  });

  it("orders ties by userId so the list is stable between refreshes", () => {
    const rows = [
      { userId: "z", value: 5, sessions: 1 },
      { userId: "m", value: 5, sessions: 1 },
    ];
    assert.deepEqual(
      rankRows(rows, METRICS.WEIGHTED_MINUTES).map((r) => r.userId),
      ["m", "z"],
    );
    assert.deepEqual(
      rankRows([...rows].reverse(), METRICS.WEIGHTED_MINUTES).map((r) => r.userId),
      ["m", "z"],
    );
  });

  it("keeps one lucky short session off the top of the focus board", () => {
    const ranked = rankRows(
      [
        // One 98 - a single good session, not a pattern.
        { userId: "lucky", value: 98, sessions: 1 },
        { userId: "steady", value: 74, sessions: MIN_SCORED_SESSIONS },
      ],
      METRICS.FOCUS_SCORE,
    );
    assert.deepEqual(ranked.map((r) => r.userId), ["steady"]);
    assert.equal(ranked[0].rank, 1);
  });

  it("does not apply the focus floor to the other boards", () => {
    const ranked = rankRows(
      [{ userId: "a", value: 12, sessions: 1 }],
      METRICS.WEIGHTED_MINUTES,
    );
    assert.equal(ranked.length, 1);
  });

  it("does not mutate its input", () => {
    const rows = [
      { userId: "a", value: 1, sessions: 1 },
      { userId: "b", value: 2, sessions: 1 },
    ];
    rankRows(rows, METRICS.WEIGHTED_MINUTES);
    assert.deepEqual(rows.map((r) => r.userId), ["a", "b"]);
  });

  it("answers an empty board with an empty list", () => {
    assert.deepEqual(rankRows([], METRICS.FOCUS_SCORE), []);
  });
});

describe("roundValue", () => {
  it("keeps one decimal for minutes and the focus estimate", () => {
    assert.equal(roundValue(METRICS.WEIGHTED_MINUTES, 42.345), 42.3);
    assert.equal(roundValue(METRICS.FOCUS_SCORE, 71.66), 71.7);
  });

  it("counts tasks in whole numbers", () => {
    assert.equal(roundValue(METRICS.TASKS_COMPLETED, 7), 7);
  });

  it("reads a missing aggregate as zero", () => {
    assert.equal(roundValue(METRICS.WEIGHTED_MINUTES, null), 0);
  });
});

describe("toDisplayName", () => {
  it("joins first and last names", () => {
    assert.equal(toDisplayName({ firstName: "Ada", lastName: "Lovelace" }), "Ada Lovelace");
  });

  it("uses whichever half exists", () => {
    assert.equal(toDisplayName({ firstName: "Ada", lastName: null }), "Ada");
    assert.equal(toDisplayName({ firstName: null, lastName: "Lovelace" }), "Lovelace");
  });

  it("is null rather than the username when there is no name, so a client can choose", () => {
    assert.equal(toDisplayName({ firstName: null, lastName: null }), null);
    assert.equal(toDisplayName({ firstName: "  ", lastName: "" }), null);
    assert.equal(toDisplayName(undefined), null);
  });
});

describe("toEntry", () => {
  it("carries everything a row on screen needs, and nothing private", () => {
    const entry = toEntry(
      { rank: 2, userId: "u1", value: 61.27, sessions: 4 },
      {
        username: "ada",
        firstName: "Ada",
        lastName: null,
        avatarUrl: "https://x/a.png",
        email: "ada@example.com",
      },
      METRICS.WEIGHTED_MINUTES,
    );
    assert.deepEqual(entry, {
      rank: 2,
      userId: "u1",
      username: "ada",
      displayName: "Ada",
      avatarUrl: "https://x/a.png",
      value: 61.3,
      sessions: 4,
    });
  });

  it("survives a user row that vanished between the two queries", () => {
    const entry = toEntry({ rank: 1, userId: "gone", value: 3, sessions: 1 }, undefined, METRICS.TASKS_COMPLETED);
    assert.equal(entry.username, null);
    assert.equal(entry.avatarUrl, null);
  });
});

describe("buildMe", () => {
  const user = { username: "me", firstName: null, lastName: null, avatarUrl: null };

  it("takes the caller's rank from the full ranked list, even off the page", () => {
    const ranked = Array.from({ length: 30 }, (_, i) => ({
      rank: i + 1,
      userId: `u${i}`,
      value: 100 - i,
      sessions: 1,
    }));
    const me = buildMe({
      userId: "u27",
      metric: METRICS.WEIGHTED_MINUTES,
      mine: { value: 73, sessions: 1 },
      ranked,
      user,
    });
    assert.equal(me.rank, 28);
    assert.equal(me.qualified, true);
  });

  it("has a null rank, not a guess, when the caller is not on the board", () => {
    const me = buildMe({
      userId: "me",
      metric: METRICS.WEIGHTED_MINUTES,
      mine: { value: null, sessions: 0 },
      ranked: [],
      user,
    });
    assert.equal(me.rank, null);
    assert.equal(me.value, 0);
    assert.equal(me.qualified, false);
  });

  it("explains a focus-board miss by how many more scored sessions are needed", () => {
    const me = buildMe({
      userId: "me",
      metric: METRICS.FOCUS_SCORE,
      mine: { value: 88, sessions: 1 },
      ranked: [],
      user,
    });
    assert.equal(me.qualified, false);
    assert.equal(me.sessionsNeeded, MIN_SCORED_SESSIONS - 1);
    // Their own average is still reported - it is theirs to see.
    assert.equal(me.value, 88);
  });

  it("is the same shape for every metric", () => {
    const keys = Object.values(METRICS).map((metric) =>
      Object.keys(
        buildMe({ userId: "me", metric, mine: { value: 1, sessions: 5 }, ranked: [], user }),
      ).sort(),
    );
    assert.deepEqual(keys[1], keys[0]);
    assert.deepEqual(keys[2], keys[0]);
  });
});
