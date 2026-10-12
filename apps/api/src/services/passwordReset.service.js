import { prisma, createLogger } from "@stdyapp/core";

import {
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_TTL_MIN,
  RESET_TOKEN_TTL_MIN,
} from "../config/mail.js";
import { HttpError } from "../utils/httpError.js";
import { sendResetCodeEmail } from "./mail.service.js";
import {
  codesMatch,
  generateResetCode,
  generateResetToken,
  hashResetCode,
  hashResetToken,
} from "./passwordResetCode.js";
import * as userService from "./user.service.js";
import * as tokenService from "./token.service.js";

/**
 * Forgot password, in three calls:
 *
 *   1. requestPasswordReset - email a six-character code
 *   2. verifyResetCode      - trade the right code for a reset token
 *   3. resetPassword        - trade the reset token for a new password
 *
 * Two rules run through all of it:
 *
 *  - NOTHING here says whether an email has an account. Step 1 answers the same
 *    for a stranger as for a user, and step 2 fails with the same message for
 *    no account, no code, a dead code and a wrong code. Otherwise this would be
 *    an account-lookup endpoint that happens to send email.
 *  - Every secret is stored hashed and is single use - see passwordResetCode.js
 *    and the PasswordResetCode model.
 *
 * Accounts made with Google can reset too. Their stored password is a random
 * placeholder nobody knows (see createGoogleUser in auth.service.js), so a
 * reset simply gives them a password as well as Google sign-in - proving you
 * can read the account's inbox is the same proof Google sign-in rests on.
 */

const log = createLogger("password-reset");

const MS_PER_MINUTE = 60 * 1000;

const INVALID_CODE = "Invalid or expired code";
const INVALID_RESET_TOKEN = "Reset session expired. Request a new code.";

/**
 * Compared against when there is no account or no live code, so a miss costs
 * the same hash-and-compare as a wrong guess. The value never matches anything.
 */
const DUMMY_CODE_HASH = "0".repeat(64);

const minutesFromNow = (minutes) => new Date(Date.now() + minutes * MS_PER_MINUTE);

/**
 * Step 1: emails a reset code, if the email has an account.
 *
 * Any earlier codes and reset tokens for the account are deleted first, so only
 * the newest email works - and asking again is how a user recovers from a code
 * they spent all their attempts on.
 *
 * The send is NOT awaited. Gmail takes around a second to accept a message, and
 * waiting for it only when the account exists would let anyone tell a real
 * account from a stranger by the response time. A failed send is logged; the
 * user sees no code arrive and asks again.
 *
 * @param {string} email - normalised by emailSchema
 * @param {{ send?: (to: string, code: string) => Promise<void> }} [options]
 *   send - injectable for tests; defaults to the real mailer
 * @returns {Promise<void>} the same, whether or not the email has an account
 */
export const requestPasswordReset = async (
  email,
  { send = sendResetCodeEmail } = {},
) => {
  const userId = await userService.findUserIdByEmail(email);
  if (!userId) return;

  const code = generateResetCode();

  await prisma.$transaction([
    prisma.passwordResetCode.deleteMany({ where: { userId } }),
    prisma.passwordResetCode.create({
      data: {
        userId,
        codeHash: hashResetCode(userId, code),
        expiresAt: minutesFromNow(RESET_CODE_TTL_MIN),
      },
    }),
  ]);

  send(email, code).catch((err) =>
    log.error(`could not send reset code to ${email}: ${err.message}`),
  );
};

/**
 * Step 2: checks a code, and on a match hands back a reset token.
 *
 * Every failure is the same 400, for the reason at the top of this file. A
 * wrong guess is counted, and RESET_CODE_MAX_ATTEMPTS wrong guesses kill the
 * code even for the right answer.
 *
 * Verifying is a conditional update - only an unverified, unexhausted row -
 * so two requests with the right code at once cannot both get a token. The
 * same compare-and-set as rotateRefreshToken in token.service.js.
 *
 * @param {string} email - normalised by emailSchema
 * @param {string} code - uppercased by verifyResetCodeSchema
 * @returns {Promise<{ resetToken: string, expiresAt: Date }>}
 * @throws {HttpError} 400 for any code that does not verify
 */
export const verifyResetCode = async (email, code) => {
  const userId = await userService.findUserIdByEmail(email);

  const row = userId
    ? await prisma.passwordResetCode.findFirst({
        where: {
          userId,
          verifiedAt: null,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true },
      })
    : null;

  if (!row || row.attempts >= RESET_CODE_MAX_ATTEMPTS) {
    codesMatch(DUMMY_CODE_HASH, userId ?? "", code);
    throw new HttpError(400, INVALID_CODE);
  }

  if (!codesMatch(row.codeHash, userId, code)) {
    await prisma.passwordResetCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    throw new HttpError(400, INVALID_CODE);
  }

  const resetToken = generateResetToken();
  const expiresAt = minutesFromNow(RESET_TOKEN_TTL_MIN);

  const { count } = await prisma.passwordResetCode.updateMany({
    where: {
      id: row.id,
      verifiedAt: null,
      attempts: { lt: RESET_CODE_MAX_ATTEMPTS },
    },
    data: {
      verifiedAt: new Date(),
      resetTokenHash: hashResetToken(resetToken),
      expiresAt,
    },
  });

  // Another request verified (or exhausted) this code between the read and
  // the write. Only one of them gets a token.
  if (count === 0) throw new HttpError(400, INVALID_CODE);

  return { resetToken, expiresAt };
};

/**
 * Step 3: sets the new password and signs the account out everywhere.
 *
 * Signing out everywhere is the point as much as the password is: someone who
 * resets a password is often doing it because somebody else got in, and their
 * sessions must not outlive the old password. Access tokens already issued
 * still run out their 15 minutes - see token.service.js.
 *
 * Consuming the token, writing the password and revoking the sessions happen
 * in ONE transaction, so a failure part-way cannot leave a used token with the
 * old password, or a new password with the old sessions still alive.
 *
 * @param {string} resetToken
 * @param {string} password - already checked by passwordSchema
 * @returns {Promise<void>}
 * @throws {HttpError} 400 when the token is unknown, used or expired
 */
export const resetPassword = async (resetToken, password) => {
  const resetTokenHash = hashResetToken(resetToken);

  const row = await prisma.passwordResetCode.findUnique({
    where: { resetTokenHash },
    select: { id: true, userId: true, consumedAt: true, expiresAt: true },
  });

  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    throw new HttpError(400, INVALID_RESET_TOKEN);
  }

  // Before the transaction, not inside it - see hashPassword.
  const passwordHash = await userService.hashPassword(password);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.passwordResetCode.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });

    // Used by a parallel request, or expired while the password was hashing.
    if (count === 0) throw new HttpError(400, INVALID_RESET_TOKEN);

    await userService.setPasswordHash(row.userId, passwordHash, tx);
    await tokenService.revokeAllForUser(row.userId, tx);
  });
};
