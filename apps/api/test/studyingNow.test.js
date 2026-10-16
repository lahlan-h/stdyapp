import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toStudyingNow } from "../src/services/studyingNow.js";

/**
 * The group feed's live strip. What matters: one row per person however many
 * sessions they have open, the viewer first, the rest by who started first,
 * and no detail beyond "here or elsewhere" about where they are studying.
 */

const GROUP = "group-night-owls";
const VIEWER = "viewer";

const session = (userId, startedAt, overrides = {}) => ({
  id: `session-${userId}-${startedAt}`,
  userId,
  groupId: null,
  startedAt: new Date(startedAt),
  plannedMinutes: null,
  user: { id: userId, username: `${userId}_name`, firstName: null, lastName: null, avatarUrl: null },
  ...overrides,
});

describe("toStudyingNow", () => {
  it("is empty when nobody is studying", () => {
    assert.deepEqual(toStudyingNow([], { groupId: GROUP, viewerId: VIEWER }), []);
  });

  it("orders by who started first, with the viewer ahead of everyone", () => {
    const rows = toStudyingNow(
      [
        session("cy", "2026-10-16T09:30:00Z"),
        session(VIEWER, "2026-10-16T09:45:00Z"),
        session("ada", "2026-10-16T08:00:00Z"),
      ],
      { groupId: GROUP, viewerId: VIEWER },
    );
    assert.deepEqual(
      rows.map((row) => row.userId),
      [VIEWER, "ada", "cy"],
    );
    assert.equal(rows[0].isMine, true);
    assert.equal(rows[1].isMine, false);
  });

  it("keeps one row per person - their newest session", () => {
    const rows = toStudyingNow(
      [
        session("ada", "2026-10-16T07:00:00Z", { id: "stale" }),
        session("ada", "2026-10-16T09:00:00Z", { id: "current", plannedMinutes: 50 }),
      ],
      { groupId: GROUP, viewerId: VIEWER },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].startedAt.toISOString(), "2026-10-16T09:00:00.000Z");
    assert.equal(rows[0].plannedMinutes, 50);
  });

  it("says whether someone is studying in this group, and never names another", () => {
    const [here, elsewhere, solo] = toStudyingNow(
      [
        session("ada", "2026-10-16T08:00:00Z", { groupId: GROUP }),
        session("bo", "2026-10-16T08:10:00Z", { groupId: "some-other-group" }),
        session("cy", "2026-10-16T08:20:00Z"),
      ],
      { groupId: GROUP, viewerId: VIEWER },
    );
    assert.equal(here.studyingHere, true);
    assert.equal(elsewhere.studyingHere, false);
    assert.equal(solo.studyingHere, false);
    for (const row of [here, elsewhere, solo]) {
      assert.equal("groupId" in row, false, "a row must not carry which group it is in");
      assert.equal("id" in row, false, "a row must not carry the session id");
    }
  });

  it("builds a display name from first and last, or leaves it null", () => {
    const [named, bare] = toStudyingNow(
      [
        session("ada", "2026-10-16T08:00:00Z", {
          user: { id: "ada", username: "ada_l", firstName: " Ada ", lastName: "Lovelace", avatarUrl: "a.png" },
        }),
        session("bo", "2026-10-16T08:10:00Z"),
      ],
      { groupId: GROUP, viewerId: VIEWER },
    );
    assert.equal(named.displayName, "Ada Lovelace");
    assert.equal(named.avatarUrl, "a.png");
    assert.equal(bare.displayName, null);
    assert.equal(bare.username, "bo_name");
  });
});
