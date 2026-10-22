import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { defaultPostTitle } from "./defaultPostTitle.ts";

/** Local times, built from parts so the test means the same in any zone. */
const at = (hour: number, minute = 0) => new Date(2026, 9, 16, hour, minute);

describe("defaultPostTitle", () => {
  it("names a morning session from 5am", () => {
    assert.equal(defaultPostTitle(at(5)), "☀️ Morning study session");
    assert.equal(defaultPostTitle(at(11, 59)), "☀️ Morning study session");
  });

  it("names an afternoon session from noon", () => {
    assert.equal(defaultPostTitle(at(12)), "🌤️ Afternoon study session");
    assert.equal(defaultPostTitle(at(17, 59)), "🌤️ Afternoon study session");
  });

  it("names a night session from 6pm through the small hours", () => {
    assert.equal(defaultPostTitle(at(18)), "🌙 Night study session");
    assert.equal(defaultPostTitle(at(23, 30)), "🌙 Night study session");
    assert.equal(defaultPostTitle(at(0)), "🌙 Night study session");
    assert.equal(defaultPostTitle(at(4, 59)), "🌙 Night study session");
  });
});
