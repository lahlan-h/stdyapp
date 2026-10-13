import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkoutBodySchema,
  emptyBodySchema,
} from "../src/validation/subscription.validation.js";

/**
 * checkoutBodySchema is the one subscription body that takes a field, and the
 * field is a URL Stripe will redirect a paying user to - so what it REFUSES
 * matters more than what it accepts.
 */

describe("checkoutBodySchema", () => {
  it("still accepts an empty body - web sends none", () => {
    assert.equal(checkoutBodySchema.safeParse({}).success, true);
  });

  it("accepts the app's own scheme and Expo Go's", () => {
    for (const returnUrl of [
      "stdyapp://plans",
      "exp://192.168.1.10:8081/--/plans",
      "exps://u.expo.dev/abc/--/plans",
    ]) {
      assert.equal(
        checkoutBodySchema.safeParse({ returnUrl }).success,
        true,
        `${returnUrl} should be accepted`,
      );
    }
  });

  it("refuses web URLs - they would make Checkout an open redirect", () => {
    for (const returnUrl of [
      "https://evil.example/plans",
      "http://localhost:8081/plans",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      assert.equal(
        checkoutBodySchema.safeParse({ returnUrl }).success,
        false,
        `${returnUrl} should be refused`,
      );
    }
  });

  it("refuses a query or fragment - the service appends its own", () => {
    for (const returnUrl of ["stdyapp://plans?checkout=success", "stdyapp://plans#x"]) {
      assert.equal(checkoutBodySchema.safeParse({ returnUrl }).success, false);
    }
  });

  it("refuses server-written fields, as emptyBodySchema does", () => {
    assert.equal(checkoutBodySchema.safeParse({ status: "ACTIVE" }).success, false);
    assert.equal(emptyBodySchema.safeParse({ returnUrl: "stdyapp://plans" }).success, false);
  });
});
