import crypto from "node:crypto";

import { RESET_CODE_LENGTH } from "../config/mail.js";

/**
 * The password-reset code and token mechanics, as pure functions so they can be
 * unit tested without a database. passwordReset.service.js owns the flow.
 */

/**
 * A-Z and 2-9 without the look-alikes 0/O and 1/I, so a code read off a phone
 * screen cannot be mistyped. The mobile app still accepts all of A-Z and 0-9 -
 * it only ever sends what it was given.
 */
export const RESET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// The same 256 bits as a refresh token - see token.service.js.
const RESET_TOKEN_BYTES = 32;

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

/**
 * A fresh code. crypto.randomInt, not Math.random: a predictable code is a
 * password reset for anyone who can predict it.
 *
 * @returns {string} RESET_CODE_LENGTH characters from RESET_CODE_ALPHABET
 */
export const generateResetCode = () =>
  Array.from(
    { length: RESET_CODE_LENGTH },
    () => RESET_CODE_ALPHABET[crypto.randomInt(RESET_CODE_ALPHABET.length)],
  ).join("");

/**
 * The stored form of a code. The user id is mixed in so the same code issued to
 * two people never hashes the same, and so a hash copied onto another user's
 * row cannot match.
 *
 * SHA-256 rather than bcrypt for the reason token.service.js gives, plus one of
 * its own: a code lives for ten minutes and dies after five wrong guesses, so
 * an offline attack on a leaked hash would end long after the code had.
 *
 * @param {string} userId
 * @param {string} code
 * @returns {string} lowercase hex digest
 */
export const hashResetCode = (userId, code) => sha256(`${userId}:${code}`);

/**
 * Whether `code` is the code behind `storedHash`. Constant-time, so the
 * response time says nothing about how much of a guess was right.
 *
 * @param {string} storedHash
 * @param {string} userId
 * @param {string} code
 * @returns {boolean}
 */
export const codesMatch = (storedHash, userId, code) => {
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hashResetCode(userId, code), "hex");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
};

/**
 * What a verified code is exchanged for: proof, for the next fifteen minutes,
 * that this person read the email. Opaque random bytes with a row behind them,
 * like a refresh token, so it can be single-use.
 *
 * @returns {string} base64url
 */
export const generateResetToken = () =>
  crypto.randomBytes(RESET_TOKEN_BYTES).toString("base64url");

/** @param {string} token @returns {string} lowercase hex digest */
export const hashResetToken = (token) => sha256(token);
