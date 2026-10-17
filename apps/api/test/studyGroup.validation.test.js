import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  searchGroupsQuerySchema,
  joinByCodeSchema,
  updateGroupSchema,
} from "../src/validation/studyGroup.validation.js";

/**
 * GET /api/groups answers in two shapes, switched on whether ?page is present:
 * the paginated envelope for current apps, and the old bare array for builds
 * older than pagination. The schema is what keeps that switch readable, so an
 * absent page must stay absent rather than being defaulted to 1.
 */
describe("searchGroupsQuerySchema", () => {
  it("leaves page absent when the client sent none - the legacy switch", () => {
    const parsed = searchGroupsQuerySchema.parse({});
    assert.equal(parsed.page, undefined);
    assert.equal(parsed.q, undefined);
  });

  it("reads page and limit as numbers when given", () => {
    const parsed = searchGroupsQuerySchema.parse({ page: "2", limit: "10", q: " maths " });
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, 10);
    assert.equal(parsed.q, "maths");
  });

  it("rejects a zero page, an oversized limit and unknown keys", () => {
    for (const query of [{ page: "0" }, { limit: "101" }, { pg: "2" }]) {
      assert.equal(
        searchGroupsQuerySchema.safeParse(query).success,
        false,
        `${JSON.stringify(query)} should be rejected`,
      );
    }
  });
});

/**
 * A code alone joins a group, so what counts as one matters: forgiving of how
 * people type, strict about what reaches the lookup.
 */
describe("joinByCodeSchema", () => {
  it("reads a typed code as the code it means", () => {
    assert.equal(joinByCodeSchema.parse({ code: "k3p-q7x" }).code, "K3PQ7X");
    assert.equal(joinByCodeSchema.parse({ code: " K3P Q7X " }).code, "K3PQ7X");
  });

  it("still takes an older code from before every group had one", () => {
    // The old generator's base36, which the new alphabet leaves 0 and 1 out of.
    assert.equal(joinByCodeSchema.parse({ code: "A1B0C9" }).code, "A1B0C9");
  });

  it("refuses junk, a missing code and extra keys", () => {
    for (const body of [
      {},
      { code: "" },
      { code: "abc" },
      { code: "K3P!7X" },
      { code: "X".repeat(17) },
      { code: "K3PQ7X", groupId: "anything" },
    ]) {
      assert.equal(
        joinByCodeSchema.safeParse(body).success,
        false,
        `${JSON.stringify(body)} should be rejected`,
      );
    }
  });
});

describe("updateGroupSchema", () => {
  it("no longer lets an owner choose a join code", () => {
    assert.equal(updateGroupSchema.safeParse({ joinCode: "MYCODE" }).success, false);
  });

  it("still updates the name, description and privacy", () => {
    assert.equal(
      updateGroupSchema.safeParse({ name: "Night Owls", isPrivate: true, description: null })
        .success,
      true,
    );
  });
});
