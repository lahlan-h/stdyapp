import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@stdyapp/core";

import * as userService from "./user.service.js";
import * as tokenService from "./token.service.js";
import { HttpError } from "../utils/httpError.js";
import { getGoogleClientIds } from "../config/auth.js";

/**
 * Login (password and Google), registration and logout flows.
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
 * Longest a generated username's base may be, leaving room for a numeric
 * suffix inside usernameSchema's 30-character cap.
 */
const MAX_USERNAME_BASE_LENGTH = 26;

/** usernameSchema's floor. */
const MIN_USERNAME_LENGTH = 3;

/** How many numbered variants to try before falling back to a random suffix. */
const MAX_USERNAME_ATTEMPTS = 20;

/** nameSchema's cap - Google names are cut to it rather than rejected. */
const MAX_NAME_LENGTH = 50;

const GOOGLE_SIGN_IN_FAILED = "Google sign-in failed";

/**
 * One verifier for the process. It caches Google's signing certificates
 * between calls, so building one per request would refetch them every time.
 */
const googleClient = new OAuth2Client();

/**
 * A username derived from an email's local part, unused at the time of asking.
 *
 * "Sam.Kim+study@gmail.com" becomes "sam_kim_study": lowercased, anything
 * outside usernameSchema's alphabet mapped to "_", runs collapsed, ends
 * trimmed. Too short gets "user" appended; taken gets 2, 3, ... and, past that,
 * a random four digits. The unique index still has the final say - see the
 * retry in createGoogleUser.
 *
 * @param {string} email
 * @returns {Promise<string>}
 */
const generateUsername = async (email) => {
  let base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, MAX_USERNAME_BASE_LENGTH);

  if (base.length < MIN_USERNAME_LENGTH) {
    base = `${base}user`.slice(0, MAX_USERNAME_BASE_LENGTH);
  }

  const isFree = async (username) =>
    !(await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    }));

  for (let attempt = 1; attempt <= MAX_USERNAME_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}${attempt}`;
    if (await isFree(candidate)) return candidate;
  }

  return `${base}${crypto.randomInt(1000, 10000)}`;
};

/**
 * A Google name claim as nameSchema would accept it, or undefined to leave the
 * field out - an empty name is a 400 in the schema, and absent is how "no name
 * yet" is said.
 *
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
const toName = (value) => {
  const trimmed = value?.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed ? trimmed : undefined;
};

/**
 * Verifies a Google ID token and returns the claims we rely on.
 *
 * verifyIdToken checks the signature against Google's published keys, the
 * expiry, the issuer, and that the audience is one of OUR client IDs - the
 * last being what stops a token Google minted for some other app from being
 * replayed here. Every failure is the same 401: the caller learns nothing
 * about which check failed.
 *
 * @param {string} idToken
 * @param {string[]} audience
 * @returns {Promise<{ sub: string, email: string, givenName?: string, familyName?: string }>}
 * @throws {HttpError} 401 when the token is invalid or the email unverified
 */
const verifyGoogleIdToken = async (idToken, audience) => {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, GOOGLE_SIGN_IN_FAILED);
  }

  if (!payload?.sub || !payload.email) {
    throw new HttpError(401, GOOGLE_SIGN_IN_FAILED);
  }

  // Linking by email is only safe when Google vouches for the address. An
  // unverified one could be anybody's, and linking it would hand them the
  // stdy account that owns it.
  if (payload.email_verified !== true) {
    throw new HttpError(401, "Your Google account's email is not verified");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    givenName: payload.given_name,
    familyName: payload.family_name,
  };
};

/**
 * Creates the account for a first-time Google user, and links it.
 *
 * Through userService.createUser, like registration and the dev account, so
 * hashing and the field allowlist stay in one place. The password is 32
 * random bytes nobody ever learns - devAuth.service.js's approach - so the
 * account is reachable only through Google.
 *
 * googleId is written in a second step because createUser's allowlist does not
 * (and must not) accept it from request-shaped input.
 *
 * @returns {Promise<{ id: string, username: string } | null>} null when the
 *   email turned out to be taken - a concurrent first sign-in won the race
 */
const createGoogleUser = async ({ sub, email, givenName, familyName }) => {
  const firstName = toName(givenName);
  const lastName = toName(familyName);
  const input = {
    email,
    password: crypto.randomBytes(32).toString("base64url"),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };

  // Twice at most: the generated name was free when checked, but another
  // signup can take it before the insert. A second clash in the same instant
  // is not worth a loop.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = await userService.createUser({
        ...input,
        username: await generateUsername(email),
      });
      return prisma.user.update({
        where: { id: user.id },
        data: { googleId: sub },
        select: { id: true, username: true },
      });
    } catch (err) {
      if (err.status !== 409) throw err;
      // An email clash means the account now exists - the caller links it.
      // prismaError.js names the field first: "Email is already in use".
      if (err.message.startsWith("Email")) return null;
    }
  }

  throw new HttpError(409, "Could not pick a username - try again");
};

/**
 * Signs in with a Google ID token: finds, links or creates the account.
 *
 * 1. A user already linked to this Google account - signed in.
 * 2. Otherwise a user with this verified email - linked, then signed in. Their
 *    password keeps working; Google becomes a second way into the same account.
 * 3. Otherwise a new account, with a username generated from the email.
 *
 * Answers with the same token pair as a password login, so a Google session is
 * indistinguishable from any other one downstream.
 *
 * @param {string} idToken
 * @param {string} [userAgent]
 * @returns {Promise<{ user: object, tokens: object }>}
 * @throws {HttpError} 503 when no Google client IDs are configured, 401 when
 *   the token does not verify
 */
export const loginWithGoogle = async (idToken, userAgent) => {
  const audience = getGoogleClientIds();
  if (audience.length === 0) {
    throw new HttpError(503, "Google sign-in is not configured");
  }

  const claims = await verifyGoogleIdToken(idToken, audience);
  const select = { id: true, username: true };

  const linkByEmail = async () => {
    const existing = await prisma.user.findUnique({
      where: { email: claims.email },
      select,
    });
    if (!existing) return null;
    return prisma.user.update({
      where: { id: existing.id },
      data: { googleId: claims.sub },
      select,
    });
  };

  // The trailing linkByEmail covers createGoogleUser losing a race to a
  // concurrent first sign-in with the same email.
  const user =
    (await prisma.user.findUnique({ where: { googleId: claims.sub }, select })) ??
    (await linkByEmail()) ??
    (await createGoogleUser(claims)) ??
    (await linkByEmail());

  if (!user) throw new HttpError(401, GOOGLE_SIGN_IN_FAILED);

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
