import crypto from "node:crypto";

import jwt from "jsonwebtoken";
import { prisma } from "@stdyapp/core";

import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  JWT_ISSUER,
  JWT_AUDIENCE,
  getJwtSecret,
} from "../config/auth.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Issues, verifies and rotates tokens.
 *
 * This layer owns the CREDENTIAL mechanics - what a token is made of, how long
 * it lives and when it dies. auth.service.js owns the login/logout flows that
 * use them, and knows nothing about signing. Controllers know neither.
 *
 * Two different kinds of token, on purpose:
 *
 *  - the ACCESS token is a signed JWT, verified with no database round trip, so
 *    the common case (every authenticated request) costs a signature check
 *  - the REFRESH token is opaque random bytes with a database row behind it,
 *    because it must be REVOCABLE, and a stateless token cannot be revoked
 *
 * That split is the whole reason a plain "just use a long-lived JWT" design was
 * rejected: it has no logout.
 */

// 32 bytes of CSPRNG output - 256 bits, the same order as the SHA-256 that
// stores it. Anything shorter would make the hash the stronger half.
const REFRESH_TOKEN_BYTES = 32;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const INVALID_REFRESH_TOKEN = "Invalid or expired refresh token";

/**
 * Hashes a refresh token for storage and lookup.
 *
 * SHA-256, deliberately not bcrypt. bcrypt exists to slow down guessing of
 * LOW-entropy secrets that humans chose; these are 256 random bits, so there is
 * nothing to guess, and bcrypt's ~300ms would be added to every single refresh
 * for no gain. It would also break the lookup: bcrypt salts each hash, so the
 * same token hashes differently every time and could not be found by an indexed
 * WHERE tokenHash = ... query.
 *
 * @param {string} token - the plaintext refresh token
 * @returns {string} lowercase hex digest
 */
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

/**
 * Signs a short-lived access token.
 *
 * The payload carries ONLY the user id and username. A JWT is signed, not
 * encrypted - anyone holding it can base64-decode the body - so email and
 * anything else personal stays out. `sub` is the standard claim for "who this
 * token is about"; requireAuth reads it and loads the rest from the database.
 *
 * @param {{ id: string, username: string }} user
 * @returns {string} a signed JWT
 */
export const signAccessToken = (user) =>
  jwt.sign({ username: user.username }, getJwtSecret(), {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

/**
 * Verifies an access token and returns its claims.
 *
 * issuer and audience are verified, not just the signature. Without them any
 * token signed with the same secret - including one minted by a future
 * unrelated service that shares it - would be accepted here.
 *
 * Library errors are translated rather than propagated: jsonwebtoken's messages
 * ("jwt malformed", "invalid signature") would otherwise reach the client
 * through the error middleware, which echoes err.message verbatim.
 *
 * @param {string} token
 * @returns {{ sub: string, username: string }}
 * @throws {HttpError} 401 on any verification failure
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (err) {
    // Distinguished from the generic case ONLY so a client knows to refresh
    // rather than to send the user back to the login screen. It leaks nothing:
    // the holder of an expired token can read its exp claim themselves.
    if (err.name === "TokenExpiredError") {
      throw new HttpError(401, "Access token expired", { cause: err });
    }

    throw new HttpError(401, "Invalid access token", { cause: err });
  }
};

/**
 * Issues a refresh token and records its hash.
 *
 * Returns the PLAINTEXT, which is the only time it ever exists outside the
 * client - only the hash is persisted, so a token that is lost here cannot be
 * recovered from the database.
 *
 * @param {string} userId
 * @param {string} [userAgent] - for a future "your devices" screen only
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export const issueRefreshToken = async (userId, userAgent) => {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      // Truncated: this is an untrusted client-supplied header and the column
      // is unbounded TEXT, so a hostile client could otherwise write megabytes.
      userAgent: userAgent?.slice(0, 255) ?? null,
    },
  });

  return { token, expiresAt };
};

/**
 * Issues a matching access + refresh pair.
 *
 * @param {{ id: string, username: string }} user
 * @param {string} [userAgent]
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 */
export const issueTokenPair = async (user, userAgent) => {
  const { token, expiresAt } = await issueRefreshToken(user.id, userAgent);

  return {
    accessToken: signAccessToken(user),
    refreshToken: token,
    expiresAt,
  };
};

/**
 * Revokes every live token for a user - "log out everywhere".
 *
 * Also the automatic response to detected token theft, see rotateRefreshToken.
 *
 * @param {string} userId
 * @returns {Promise<number>} how many tokens were revoked
 */
export const revokeAllForUser = async (userId) => {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count;
};

/**
 * Exchanges a refresh token for a fresh pair, invalidating the old one.
 *
 * Rotation on every use is what makes a stolen refresh token detectable. Once
 * rotated, a token is kept (revoked, not deleted) precisely so that a later
 * attempt to use it can be recognised: a token is only ever presented twice if
 * a copy exists somewhere it should not. The response is to revoke the user's
 * whole token family, which logs out the attacker AND the victim - noisy, but
 * the alternative is leaving an intruder logged in for 30 days.
 *
 * @param {string} token - the plaintext refresh token
 * @param {string} [userAgent]
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date }>}
 * @throws {HttpError} 401 when the token is unknown, revoked or expired
 */
export const rotateRefreshToken = async (token, userAgent) => {
  const tokenHash = hashToken(token);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, username: true } },
    },
  });

  if (!existing) throw new HttpError(401, INVALID_REFRESH_TOKEN);

  // Presented twice - the token leaked. Burn the whole family.
  if (existing.revokedAt) {
    await revokeAllForUser(existing.userId);
    throw new HttpError(401, INVALID_REFRESH_TOKEN);
  }

  if (existing.expiresAt <= new Date()) {
    throw new HttpError(401, INVALID_REFRESH_TOKEN);
  }

  // Conditional update rather than a plain update: `revokedAt: null` in the
  // WHERE makes this a single atomic compare-and-set, so two refreshes racing
  // on the same token cannot both succeed and mint two valid families.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Lost the race. Deliberately NOT treated as theft: a double-tapped refresh
  // button is indistinguishable from an attack here, and revoking the family
  // would log a legitimate user out for a UI glitch. Genuine reuse is still
  // caught by the revokedAt check above on the next attempt.
  if (count === 0) throw new HttpError(401, INVALID_REFRESH_TOKEN);

  return issueTokenPair(existing.user, userAgent);
};

/**
 * Revokes a single token - an ordinary logout on one device.
 *
 * Silent when the token is unknown or already revoked. Logout is idempotent by
 * design: telling an unauthenticated caller whether a token existed would be a
 * free oracle, and a client retrying a logout should not see an error.
 *
 * @param {string} token - the plaintext refresh token
 * @returns {Promise<void>}
 */
export const revokeRefreshToken = async (token) => {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
