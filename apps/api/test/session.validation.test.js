import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  startSessionSchema,
  addInterruptionSchema,
  INTERRUPTION_TYPES,
} from "../src/validation/session.validation.js";

/**
 * Only the two fields the focus feature added to the sessions resource -
 * plannedMinutes on start, type on interruptions. Both are optional, so the
 * most important assertion in each group is that an OLD client, which sends
 * neither, still validates.
 */

describe("startSessionSchema.plannedMinutes", () => {
  it("still accepts a body with no plan - older clients send none", () => {
    assert.equal(startSessionSchema.safeParse({}).success, true);
    assert.equal(startSessionSchema.safeParse({ plannedMinutes: null }).success, true);
  });

  it("accepts a plan within 1 minute to 24 hours", () => {
    for (const plannedMinutes of [1, 25, 60, 1440]) {
      assert.equal(
        startSessionSchema.safeParse({ plannedMinutes }).success,
        true,
        `${plannedMinutes} should be accepted`,
      );
    }
  });

  it("rejects zero, negative, fractional and absurd plans", () => {
    for (const plannedMinutes of [0, -30, 12.5, 1441, 99999]) {
      assert.equal(
        startSessionSchema.safeParse({ plannedMinutes }).success,
        false,
        `${plannedMinutes} should be rejected`,
      );
    }
  });

  it("combines with groupId", () => {
    const result = startSessionSchema.safeParse({
      groupId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      plannedMinutes: 45,
    });
    assert.equal(result.success, true);
  });
});

describe("addInterruptionSchema.type", () => {
  it("still accepts an untyped interruption - older clients send none", () => {
    assert.equal(addInterruptionSchema.safeParse({ durationSec: 30 }).success, true);
    assert.equal(
      addInterruptionSchema.safeParse({ durationSec: 30, type: null }).success,
      true,
    );
  });

  it("accepts every declared interruption type", () => {
    for (const type of INTERRUPTION_TYPES) {
      assert.equal(
        addInterruptionSchema.safeParse({ durationSec: 30, type }).success,
        true,
        `${type} should be accepted`,
      );
    }
  });

  it("rejects an unknown type rather than writing garbage to an enum column", () => {
    for (const type of ["BATHROOM", "app_exit", "", 3]) {
      assert.equal(
        addInterruptionSchema.safeParse({ durationSec: 30, type }).success,
        false,
        `${JSON.stringify(type)} should be rejected`,
      );
    }
  });

  it("matches the Prisma enum exactly", () => {
    assert.deepEqual(INTERRUPTION_TYPES, ["APP_EXIT", "DEVICE_MOTION", "MANUAL"]);
  });
});
