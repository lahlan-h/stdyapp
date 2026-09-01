import bcrypt from "bcryptjs";
import { prisma } from "@stdyapp/core";

import * as userService from "./user.service.js";
import * as tokenService from "./token.service.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Login, registration and logout flows.
 *
 * This layer owns the CREDENTIAL POLICY - what counts as proof of identity and
 * what a failure is allowed to reveal. token.service.js owns the token
 * mechanics, user.service.js owns the user record, and controllers own status
 * codes.
 *
 * Password hashing deliberately does NOT appear here: registration delegates to
 * userService.createUser, which already hashes with the cost factor and the
 * field allowlist documented there. Two hashing call sites would be two places
 * to get the cost factor wrong.
 */

/**
 * A real bcrypt hash, of a random value nobody knows and no one will ever
 * submit. Used only to burn the same ~350ms when the account does not exist.
 *
 * Without it, an unknown username returns as fast as the database lookup while
 * a known one takes a full bcrypt compare - a timing difference of two orders
 * of magnitude, trivially measurable over the network, which turns login into
 * an account-enumeration oracle. That would undo the care taken in
 * user.service.js to keep listUsers from searching email.
 *
 * Not a secret: it is a hash of random bytes and grants nothing.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$fjfAZsUcAOYcU35Mk31uI.4nxj787RJ02q0ivrxUEeVAkUyVTQIdq";

// ONE message for every failure mode. Saying "no such user" versus "wrong
// password" would hand over the same enumeration oracle the timing defence
// above exists to close.
const INVALID_CREDENTIALS = "Invalid credentials";

/**
 * Finds a user by email or username, with the password hash.
 *
 * The explicit `select` including passwordHash is the deliberate, greppable
 * exception that USER_PUBLIC_SELECT in user.service.js anticipates. It is the
 * only place in the app that loads a hash, and the value never leaves this
 * module.
 *
 * Email is lowercased to match how emailSchema normalises it on the way in;
 * username is NOT, because the unique index is case-sensitive and "Ada" and
 * "ada" are different accounts.
 *
 * @param {string} identifier - an email address or a username
 * @returns {Promise<{ id: string, username: string, passwordHash: string } | null>}
 */
const findUserByIdentifier = async (identifier) =>
  prisma.user.findFirst({
    where: {
      OR: [{ email: identifier.toLowerCase() }, { username: identifier }],
    },
    select: { id: true, username: true, passwordHash: true },
  });

/**
 * Creates an account and logs it straight in.
 *
 * @param {object} input - validated registerSchema body
 * @param {string} [userAgent]
 * @returns {Promise<{ user: object, tokens: object }>}
 * @throws {HttpError} 409 on a duplicate email or username (raised by userService)
 */
export const register = async (input, userAgent) => {
  const user = await userService.createUser(input);
  const tokens = await tokenService.issueTokenPair(user, userAgent);

  return { user, tokens };
};

/**
 * Verifies credentials and issues a token pair.
 *
 * @param {{ identifier: string, password: string }} credentials
 * @param {string} [userAgent]
 * @returns {Promise<{ user: object, tokens: object }>}
 * @throws {HttpError} 401 when the identifier or password is wrong
 */
export const login = async ({ identifier, password }, userAgent) => {
  const user = await findUserByIdentifier(identifier);

  // ALWAYS compare, even with no user, so both paths cost the same. Assigning
  // the dummy hash rather than returning early is the entire point - an early
  // return here would reintroduce the timing leak.
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const isValid = await bcrypt.compare(password, passwordHash);

  if (!user || !isValid) throw new HttpError(401, INVALID_CREDENTIALS);

  // Fire-and-forget would be faster, but an unawaited promise that rejects is
  // an unhandled rejection. It is one indexed update.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  });

  return {
    user: await userService.getUserById(user.id),
    tokens: await tokenService.issueTokenPair(user, userAgent),
  };
};

/**
 * Exchanges a refresh token for a fresh pair.
 *
 * @param {string} refreshToken
 * @param {string} [userAgent]
 * @returns {Promise<object>} the new token pair
 */
export const refresh = async (refreshToken, userAgent) =>
  tokenService.rotateRefreshToken(refreshToken, userAgent);

/**
 * Logs out one device. Idempotent - see revokeRefreshToken.
 *
 * @param {string} refreshToken
 * @returns {Promise<void>}
 */
export const logout = async (refreshToken) =>
  tokenService.revokeRefreshToken(refreshToken);

/**
 * Logs out every device for a user.
 *
 * @param {string} userId
 * @returns {Promise<number>} how many sessions were ended
 */
export const logoutAll = async (userId) =>
  tokenService.revokeAllForUser(userId);
