import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  startSessionSchema,
  joinSessionSchema,
  endSessionSchema,
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

  it("refuses BREAK: only the server records a break, or time away could be filed as one", () => {
    assert.equal(INTERRUPTION_TYPES.includes("BREAK"), false);
    assert.equal(
      addInterruptionSchema.safeParse({ durationSec: 300, type: "BREAK" }).success,
      false,
    );
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

describe("joinSessionSchema", () => {
  it("accepts a generated code, and normalises case and whitespace", () => {
    const parsed = joinSessionSchema.safeParse({ inviteCode: "  ab12cd " });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.inviteCode, "AB12CD");
  });

  it("rejects a missing, short, long or non-alphanumeric code", () => {
    for (const body of [
      {},
      { inviteCode: "" },
      { inviteCode: "ab" },
      { inviteCode: "A".repeat(17) },
      { inviteCode: "AB-12C" },
    ]) {
      assert.equal(
        joinSessionSchema.safeParse(body).success,
        false,
        `${JSON.stringify(body)} should be rejected`,
      );
    }
  });

  it("rejects unknown keys, so a client cannot pick the group", () => {
    assert.equal(
      joinSessionSchema.safeParse({
        inviteCode: "AB12CD",
        groupId: "00000000-0000-4000-8000-000000000000",
      }).success,
      false,
    );
  });
});

describe("endSessionSchema", () => {
  it("accepts no body at all - every older client sends none", () => {
    assert.equal(endSessionSchema.safeParse(undefined).success, true);
    assert.equal(endSessionSchema.safeParse({}).success, true);
  });

  it("accepts the moment End was tapped, as an ISO timestamp", () => {
    assert.equal(
      endSessionSchema.safeParse({ endedAt: "2026-10-12T09:30:00.000Z" }).success,
      true,
    );
  });

  it("rejects a non-timestamp and unknown keys", () => {
    for (const body of [{ endedAt: "yesterday" }, { endedAt: 12 }, { focusPoints: 999 }]) {
      assert.equal(
        endSessionSchema.safeParse(body).success,
        false,
        `${JSON.stringify(body)} should be rejected`,
      );
    }
  });
});
