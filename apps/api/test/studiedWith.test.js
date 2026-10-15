import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toStudiedWith } from "../src/services/studiedWith.js";

/**
 * Who a post says its author studied with. The cases that matter most are the
 * ones that must NOT show someone: the author themselves, a duplicate, and
 * anyone with a block between them and the viewer.
 */

const AUTHOR = "author";

/** A room member as studyBuddySelect returns them. */
const person = (id, { blocking = [], blockedBy = [] } = {}) => ({
  id,
  username: id,
  avatarUrl: null,
  firstName: null,
  lastName: null,
  blocking,
  blockedBy,
});

const baseSession = (overrides = {}) => ({
  startedAt: new Date("2026-10-15T09:00:00Z"),
  endedAt: new Date("2026-10-15T10:00:00Z"),
  focusPoints: 50,
  tasksTotal: 5,
  tasksCompleted: 4,
  participants: [],
  hostSession: null,
  ...overrides,
});

const ids = (people) => people.map((p) => p.id);

describe("toStudiedWith", () => {
  it("is empty for a solo session", () => {
    assert.deepEqual(toStudiedWith(baseSession(), AUTHOR), []);
  });

  it("lists who joined, when the author hosted the room", () => {
    const session = baseSession({
      participants: [{ user: person("sam") }, { user: person("alex") }],
    });
    assert.deepEqual(ids(toStudiedWith(session, AUTHOR)), ["sam", "alex"]);
  });

  it("lists the host and the other joiners, but not the author, when they joined", () => {
    const session = baseSession({
      hostSession: {
        user: person("host"),
        participants: [{ user: person(AUTHOR) }, { user: person("sam") }],
      },
    });
    assert.deepEqual(ids(toStudiedWith(session, AUTHOR)), ["host", "sam"]);
  });

  it("shows someone once, however many times they rejoined", () => {
    const session = baseSession({
      participants: [{ user: person("sam") }, { user: person("sam") }],
    });
    assert.deepEqual(ids(toStudiedWith(session, AUTHOR)), ["sam"]);
  });

  it("hides anyone with a block between them and the viewer, either way", () => {
    const session = baseSession({
      participants: [
        { user: person("blocksViewer", { blocking: [{ blockerId: "blocksViewer" }] }) },
        { user: person("blockedByViewer", { blockedBy: [{ blockedId: "blockedByViewer" }] }) },
        { user: person("sam") },
      ],
    });
    assert.deepEqual(ids(toStudiedWith(session, AUTHOR)), ["sam"]);
  });

  it("never puts the block relations on the wire", () => {
    const [sam] = toStudiedWith(baseSession({ participants: [{ user: person("sam") }] }), AUTHOR);
    assert.equal("blocking" in sam, false);
    assert.equal("blockedBy" in sam, false);
  });
});
