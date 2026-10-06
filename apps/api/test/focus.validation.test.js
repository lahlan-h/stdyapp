import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  sessionIdParamSchema,
  focusSampleSchema,
  createFocusSamplesSchema,
  focusRatingSchema,
  listSamplesQuerySchema,
  MAX_SAMPLES_PER_BATCH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../src/validation/focus.validation.js";

/**
 * The validation layer is the ONLY guard on these values - Prisma has no check
 * constraints, so anything that gets past a schema here reaches the database
 * as-is. A bad heart rate does not just produce one wrong row: it is folded
 * into the user's baseline and skews every future session.
 */

const validSample = { motionVariance: 0.4, inApp: true };

describe("sessionIdParamSchema", () => {
  it("accepts a UUID", () => {
    const result = sessionIdParamSchema.safeParse({
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    assert.equal(result.success, true);
  });

  it("rejects a non-UUID with a 400-shaped failure rather than a confusing 404", () => {
    assert.equal(sessionIdParamSchema.safeParse({ id: "not-a-uuid" }).success, false);
    assert.equal(sessionIdParamSchema.safeParse({ id: "" }).success, false);
  });
});

describe("focusSampleSchema", () => {
  it("accepts a minimal watch-free sample", () => {
    const result = focusSampleSchema.safeParse(validSample);
    assert.equal(result.success, true);
  });

  it("accepts an explicit null heart rate for a watch dropout", () => {
    assert.equal(
      focusSampleSchema.safeParse({ ...validSample, hr: null }).success,
      true,
    );
  });

  it("rejects implausible heart rates that would corrupt the baseline", () => {
    for (const hr of [0, 5, 19, 251, 900, -70]) {
      assert.equal(
        focusSampleSchema.safeParse({ ...validSample, hr }).success,
        false,
        `hr ${hr} should have been rejected`,
      );
    }
  });

  it("accepts heart rates at the edges of the plausible range", () => {
    for (const hr of [20, 72, 250]) {
      assert.equal(
        focusSampleSchema.safeParse({ ...validSample, hr }).success,
        true,
        `hr ${hr} should have been accepted`,
      );
    }
  });

  it("rejects a fractional heart rate", () => {
    assert.equal(
      focusSampleSchema.safeParse({ ...validSample, hr: 72.5 }).success,
      false,
    );
  });

  it("rejects a negative motion variance", () => {
    // A variance cannot be negative; one that is means the client is broken.
    assert.equal(
      focusSampleSchema.safeParse({ ...validSample, motionVariance: -1 }).success,
      false,
    );
  });

  it("requires the two signals that are always available", () => {
    assert.equal(focusSampleSchema.safeParse({ inApp: true }).success, false);
    assert.equal(focusSampleSchema.safeParse({ motionVariance: 0.2 }).success, false);
  });

  it("coerces an ISO timestamp to a Date", () => {
    const result = focusSampleSchema.safeParse({
      ...validSample,
      timestamp: "2026-09-01T09:30:00.000Z",
    });

    assert.equal(result.success, true);
    assert.ok(result.data.timestamp instanceof Date);
    assert.equal(result.data.timestamp.toISOString(), "2026-09-01T09:30:00.000Z");
  });

  it("rejects unknown keys loudly instead of dropping them", () => {
    // strictObject, matching user.validation.js: a client sending
    // computedFocus is trying to set a server-owned value and should be told.
    const result = focusSampleSchema.safeParse({
      ...validSample,
      computedFocus: 1,
    });
    assert.equal(result.success, false);
  });
});

describe("createFocusSamplesSchema", () => {
  const batch = (n) => ({ samples: Array(n).fill(validSample) });

  it("accepts a batch up to the cap", () => {
    assert.equal(createFocusSamplesSchema.safeParse(batch(1)).success, true);
    assert.equal(
      createFocusSamplesSchema.safeParse(batch(MAX_SAMPLES_PER_BATCH)).success,
      true,
    );
  });

  it("rejects a batch over the cap", () => {
    // Without this ceiling one request could insert an unbounded number of rows
    // into the fastest-growing table in the database.
    assert.equal(
      createFocusSamplesSchema.safeParse(batch(MAX_SAMPLES_PER_BATCH + 1)).success,
      false,
    );
  });

  it("rejects an empty batch as a client bug", () => {
    assert.equal(createFocusSamplesSchema.safeParse({ samples: [] }).success, false);
  });

  it("rejects a bare array - the payload must stay extensible", () => {
    assert.equal(createFocusSamplesSchema.safeParse([validSample]).success, false);
  });

  it("rejects the whole batch when any sample is invalid", () => {
    const result = createFocusSamplesSchema.safeParse({
      samples: [validSample, { ...validSample, hr: 4000 }],
    });
    assert.equal(result.success, false);
  });
});

describe("focusRatingSchema", () => {
  it("accepts every rating on the 1-5 scale", () => {
    for (const selfRating of [1, 2, 3, 4, 5]) {
      assert.equal(
        focusRatingSchema.safeParse({ selfRating }).success,
        true,
        `rating ${selfRating} should have been accepted`,
      );
    }
  });

  it("rejects ratings outside the scale", () => {
    for (const selfRating of [0, -1, 6, 100]) {
      assert.equal(
        focusRatingSchema.safeParse({ selfRating }).success,
        false,
        `rating ${selfRating} should have been rejected`,
      );
    }
  });

  it("rejects a fractional rating - it is a slider, not a mood", () => {
    assert.equal(focusRatingSchema.safeParse({ selfRating: 2.5 }).success, false);
  });

  it("coerces a numeric string, since form posts arrive as text", () => {
    const result = focusRatingSchema.safeParse({ selfRating: "3" });
    assert.equal(result.success, true);
    assert.equal(result.data.selfRating, 3);
  });

  it("rejects a missing or non-numeric rating", () => {
    assert.equal(focusRatingSchema.safeParse({}).success, false);
    assert.equal(focusRatingSchema.safeParse({ selfRating: "good" }).success, false);
  });
});

describe("listSamplesQuerySchema", () => {
  it("applies defaults for an absent query", () => {
    const result = listSamplesQuerySchema.safeParse({});
    assert.equal(result.success, true);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, DEFAULT_PAGE_SIZE);
  });

  it("coerces string params, since query strings are always text", () => {
    const result = listSamplesQuerySchema.safeParse({ page: "3", limit: "50" });
    assert.equal(result.success, true);
    assert.equal(result.data.page, 3);
    assert.equal(result.data.limit, 50);
  });

  it("caps the page size so ?limit=999999 cannot be a free denial of service", () => {
    assert.equal(
      listSamplesQuerySchema.safeParse({ limit: MAX_PAGE_SIZE }).success,
      true,
    );
    assert.equal(
      listSamplesQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success,
      false,
    );
    assert.equal(listSamplesQuerySchema.safeParse({ limit: 999999 }).success, false);
  });

  it("rejects a page below 1", () => {
    assert.equal(listSamplesQuerySchema.safeParse({ page: 0 }).success, false);
  });
});
