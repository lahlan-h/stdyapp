import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  resetRoutineSchema,
  reorderTodoItemsSchema,
} from "../src/validation/studyRoutine.validation.js";

/** The two bodies the reset and reorder routes added. */

describe("resetRoutineSchema", () => {
  it("accepts an empty body and nothing else", () => {
    assert.equal(resetRoutineSchema.safeParse({}).success, true);
    assert.equal(resetRoutineSchema.safeParse({ isComplete: true }).success, false);
  });
});

describe("reorderTodoItemsSchema", () => {
  it("accepts a list of distinct UUIDs", () => {
    const todoIds = [randomUUID(), randomUUID(), randomUUID()];
    assert.equal(reorderTodoItemsSchema.safeParse({ todoIds }).success, true);
  });

  it("refuses an empty list, a repeated id, and a non-UUID", () => {
    const id = randomUUID();
    for (const todoIds of [[], [id, id], ["order"]]) {
      assert.equal(
        reorderTodoItemsSchema.safeParse({ todoIds }).success,
        false,
        `${JSON.stringify(todoIds)} should be refused`,
      );
    }
  });

  it("refuses unknown keys, as every schema in this file does", () => {
    const todoIds = [randomUUID()];
    assert.equal(
      reorderTodoItemsSchema.safeParse({ todoIds, routineId: randomUUID() }).success,
      false,
    );
  });
});
