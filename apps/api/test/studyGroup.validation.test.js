import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { searchGroupsQuerySchema } from "../src/validation/studyGroup.validation.js";

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
