import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { deleteUserSchema } from "../src/validation/user.validation.js";

/**
 * deleteUserSchema is the proof an account delete demands on top of the token.
 * What it REFUSES matters most: a body it let through empty would delete an
 * account on the token alone.
 */

describe("deleteUserSchema", () => {
  it("accepts a password", () => {
    assert.equal(deleteUserSchema.safeParse({ password: "hunter22" }).success, true);
  });

  it("accepts a password the sign-up rules would now refuse", () => {
    // Short, and over bcrypt's 72 bytes: still a 403 to make, not a 400.
    assert.equal(deleteUserSchema.safeParse({ password: "a" }).success, true);
    assert.equal(
      deleteUserSchema.safeParse({ password: "x".repeat(100) }).success,
      true,
    );
  });

  it("does not trim the password", () => {
    const result = deleteUserSchema.safeParse({ password: " spaced " });
    assert.equal(result.success, true);
    assert.equal(result.data.password, " spaced ");
  });

  it("accepts a Google ID token", () => {
    assert.equal(
      deleteUserSchema.safeParse({ googleIdToken: "eyJhbGciOi.payload.sig" }).success,
      true,
    );
  });

  it("refuses a body with no proof", () => {
    for (const body of [undefined, null, {}, { password: "" }, { googleIdToken: "" }]) {
      assert.equal(
        deleteUserSchema.safeParse(body).success,
        false,
        `${JSON.stringify(body)} should be refused`,
      );
    }
  });

  it("refuses both proofs at once", () => {
    assert.equal(
      deleteUserSchema.safeParse({ password: "hunter22", googleIdToken: "t" }).success,
      false,
    );
  });

  it("refuses unknown keys", () => {
    assert.equal(
      deleteUserSchema.safeParse({ password: "hunter22", confirm: true }).success,
      false,
    );
  });

  it("refuses a password past the sanity bound", () => {
    assert.equal(
      deleteUserSchema.safeParse({ password: "x".repeat(513) }).success,
      false,
    );
  });
});
