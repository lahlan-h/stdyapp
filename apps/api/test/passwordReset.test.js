import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RESET_CODE_ALPHABET,
  codesMatch,
  generateResetCode,
  generateResetToken,
  hashResetCode,
  hashResetToken,
} from "../src/services/passwordResetCode.js";
import { RESET_CODE_LENGTH } from "../src/config/mail.js";
import {
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
} from "../src/validation/auth.validation.js";

/**
 * The pure half of forgot password: how codes and tokens are made and checked,
 * and what the three request bodies accept. The flow itself is covered against
 * a real database in integration/passwordReset.integration.test.js.
 */

describe("generateResetCode", () => {
  it("is six characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateResetCode();
      assert.equal(code.length, RESET_CODE_LENGTH);
      for (const char of code) assert.ok(RESET_CODE_ALPHABET.includes(char), char);
    }
  });

  it("never uses the look-alikes 0, O, 1 or I", () => {
    for (const char of "0O1I") assert.equal(RESET_CODE_ALPHABET.includes(char), false);
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 200 }, generateResetCode));
    assert.ok(codes.size > 195);
  });
});

describe("codesMatch", () => {
  const stored = hashResetCode("user-1", "ABC234");

  it("accepts the code it was made from", () => {
    assert.equal(codesMatch(stored, "user-1", "ABC234"), true);
  });

  it("rejects a different code", () => {
    assert.equal(codesMatch(stored, "user-1", "ABC235"), false);
  });

  it("rejects the right code for a different user", () => {
    assert.equal(codesMatch(stored, "user-2", "ABC234"), false);
  });

  it("rejects against a malformed stored hash rather than throwing", () => {
    assert.equal(codesMatch("not-hex", "user-1", "ABC234"), false);
  });
});

describe("reset tokens", () => {
  it("are long, url-safe and distinct", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
  });

  it("hash the same way every time, so they can be looked up", () => {
    const token = generateResetToken();
    assert.equal(hashResetToken(token), hashResetToken(token));
    assert.notEqual(hashResetToken(token), token);
  });
});

describe("forgotPasswordSchema", () => {
  it("normalises the email as sign-up stored it", () => {
    const parsed = forgotPasswordSchema.parse({ email: "  Ada@UTS.edu.au " });
    assert.equal(parsed.email, "ada@uts.edu.au");
  });

  it("rejects a non-email and unknown keys", () => {
    assert.equal(forgotPasswordSchema.safeParse({ email: "ada" }).success, false);
    assert.equal(
      forgotPasswordSchema.safeParse({ email: "ada@uts.edu.au", extra: 1 }).success,
      false,
    );
  });
});

describe("verifyResetCodeSchema", () => {
  const email = "ada@uts.edu.au";

  it("uppercases and trims the code", () => {
    assert.equal(verifyResetCodeSchema.parse({ email, code: " abc234 " }).code, "ABC234");
  });

  it("accepts any six letters or digits, not only the code alphabet", () => {
    assert.equal(verifyResetCodeSchema.safeParse({ email, code: "O0I1AA" }).success, true);
  });

  it("rejects the wrong length or other characters", () => {
    for (const code of ["ABC23", "ABC2345", "ABC-23", ""]) {
      assert.equal(verifyResetCodeSchema.safeParse({ email, code }).success, false, code);
    }
  });
});

describe("resetPasswordSchema", () => {
  const resetToken = "a".repeat(43);

  it("applies the sign-up password rule", () => {
    assert.equal(resetPasswordSchema.safeParse({ resetToken, password: "short" }).success, false);
    assert.equal(
      resetPasswordSchema.safeParse({ resetToken, password: "long enough 1!" }).success,
      true,
    );
  });

  it("requires the token", () => {
    assert.equal(
      resetPasswordSchema.safeParse({ resetToken: "", password: "long enough 1!" }).success,
      false,
    );
  });
});
