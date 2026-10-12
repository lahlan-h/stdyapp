import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Forgot password end to end: real Prisma, real Postgres, no mocks - except the
 * mailer, which is swapped for a function that catches the code, through the
 * `send` option requestPasswordReset takes for exactly this.
 *
 * SKIPPED unless TEST_DATABASE_URL is set - see focus.integration.test.js.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

const OLD_PASSWORD = "old password 1!";
const NEW_PASSWORD = "new password 2!";

let prisma, closeRedis, closeRabbitMq;
let resetService, authService, userService, tokenService, mail;

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  resetService = await import("../../src/services/passwordReset.service.js");
  authService = await import("../../src/services/auth.service.js");
  userService = await import("../../src/services/user.service.js");
  tokenService = await import("../../src/services/token.service.js");
  mail = await import("../../src/config/mail.js");
}

let userId, email;

/** Requests a code and returns what the "email" carried. */
const requestCode = async (to = email) => {
  let sent;
  await resetService.requestPasswordReset(to, {
    send: async (_to, code) => {
      sent = code;
    },
  });
  return sent;
};

/** A code that is certainly not `code`. */
const wrongCodeFor = (code) => (code === "AAAAAA" ? "BBBBBB" : "AAAAAA");

const rejectsWith400 = (promise) =>
  assert.rejects(promise, (err) => err.status === 400);

describe("password reset against a real database", { skip }, () => {
  before(async () => {
    email = `reset-${randomUUID()}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        username: `reset_${randomUUID().slice(0, 8)}`,
        passwordHash: await userService.hashPassword(OLD_PASSWORD),
      },
      select: { id: true },
    });
    userId = user.id;
  });

  after(async () => {
    try {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  it("says nothing, and stores nothing, for an email with no account", async () => {
    const before = await prisma.passwordResetCode.count();
    const sent = await requestCode(`nobody-${randomUUID()}@test.local`);
    assert.equal(sent, undefined);
    assert.equal(await prisma.passwordResetCode.count(), before);
  });

  it("resets the password and signs out every session", async () => {
    const { tokens } = await authService.login({ identifier: email, password: OLD_PASSWORD });

    const code = await requestCode();
    assert.equal(code.length, mail.RESET_CODE_LENGTH);

    const { resetToken } = await resetService.verifyResetCode(email, code);
    await resetService.resetPassword(resetToken, NEW_PASSWORD);

    await assert.rejects(
      authService.login({ identifier: email, password: OLD_PASSWORD }),
      (err) => err.status === 401,
    );
    await authService.login({ identifier: email, password: NEW_PASSWORD });

    await assert.rejects(
      tokenService.rotateRefreshToken(tokens.refreshToken),
      (err) => err.status === 401,
    );
  });

  it("will not use a reset token twice", async () => {
    const code = await requestCode();
    const { resetToken } = await resetService.verifyResetCode(email, code);
    await resetService.resetPassword(resetToken, NEW_PASSWORD);
    await rejectsWith400(resetService.resetPassword(resetToken, OLD_PASSWORD));
  });

  it("will not verify a code twice", async () => {
    const code = await requestCode();
    await resetService.verifyResetCode(email, code);
    await rejectsWith400(resetService.verifyResetCode(email, code));
  });

  it("kills a code after five wrong guesses, even for the right one", async () => {
    const code = await requestCode();
    for (let i = 0; i < mail.RESET_CODE_MAX_ATTEMPTS; i++) {
      await rejectsWith400(resetService.verifyResetCode(email, wrongCodeFor(code)));
    }
    await rejectsWith400(resetService.verifyResetCode(email, code));
  });

  it("only honours the newest code", async () => {
    const first = await requestCode();
    const second = await requestCode();
    if (first !== second) await rejectsWith400(resetService.verifyResetCode(email, first));
    await resetService.verifyResetCode(email, second);
  });

  it("rejects an expired code and an expired reset token", async () => {
    const code = await requestCode();
    await prisma.passwordResetCode.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await rejectsWith400(resetService.verifyResetCode(email, code));

    const fresh = await requestCode();
    const { resetToken } = await resetService.verifyResetCode(email, fresh);
    await prisma.passwordResetCode.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await rejectsWith400(resetService.resetPassword(resetToken, NEW_PASSWORD));
  });
});
