/**
 * Auth tuning constants and the JWT secret accessor.
 *
 * IMPORTANT: nothing here reads process.env at MODULE SCOPE. ES module imports
 * are fully evaluated before the importing module's body runs, so a module-scope
 * read would happen before ./env.js has loaded the root .env and would see
 * undefined - silently signing every token with the string "undefined". This is
 * the same rule documented in packages/core/src/redis.js; here it is a security
 * bug rather than a connection bug.
 */

// 15 minutes: short enough that a leaked access token has a small blast radius,
// long enough that a client is not refreshing on almost every screen. The
// refresh token is what actually keeps a user logged in.
export const ACCESS_TOKEN_TTL = "15m";

// 30 days of inactivity before a device must log in again. Every refresh issues
// a new token with a fresh 30-day window, so an active user is never kicked out.
export const REFRESH_TOKEN_TTL_DAYS = 30;

export const JWT_ISSUER = "stdyapp";
export const JWT_AUDIENCE = "stdyapp-api";

// 32 bytes of entropy. HS256 derives its strength entirely from this secret, so
// a short one is brute-forceable offline by anyone holding a single token.
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Returns the signing secret, or throws if it is missing or too weak.
 *
 * Throwing - rather than falling back to a generated default - is deliberate.
 * A random per-process default would "work" in development and invalidate every
 * token on each restart, then quietly ship to production as a per-instance
 * secret that breaks the moment there are two instances. A hardcoded default is
 * worse: it is a public signing key.
 *
 * Called from assertAuthConfig() at startup so a misconfiguration is a boot
 * failure with a clear message, not a 500 on the first login.
 *
 * @returns {string}
 * @throws {Error} when JWT_SECRET is unset or shorter than 32 characters
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Add it to the repo-root .env - generate one with: openssl rand -base64 48",
    );
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length}). Generate one with: openssl rand -base64 48`,
    );
  }

  return secret;
};

/**
 * Whether the credential-free dev token route may exist at all.
 *
 * The exact equality IS the security property. "production", "staging",
 * "Development", a typo and an UNSET NODE_ENV must every one of them be false:
 * the only way to enable a route that mints access tokens with no password is
 * to say the word exactly. Anything looser - a !== "production" check, say -
 * would turn every environment nobody remembered to label into a backdoor.
 *
 * Read at CALL time, never at module scope, for the reason documented at the
 * top of this file: NODE_ENV comes from the repo-root .env via ./env.js, which
 * has not run yet while this module is being evaluated.
 *
 * @returns {boolean}
 */
export const isDevAuthEnabled = () => process.env.NODE_ENV === "development";

/**
 * Fails fast at boot if auth is misconfigured.
 *
 * Called from index.js AFTER ./config/env.js has run. Without this the app
 * starts happily and the first user to hit /api/auth/login gets a 500.
 *
 * @returns {void}
 */
export const assertAuthConfig = () => {
  getJwtSecret();
};
