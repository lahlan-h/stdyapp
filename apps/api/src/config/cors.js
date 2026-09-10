/**
 * Cross-origin policy.
 *
 * IMPORTANT: nothing here reads process.env at MODULE SCOPE, for the reason
 * documented at the top of ./auth.js - imports are evaluated before ./env.js has
 * populated process.env, so a module-scope read would see undefined.
 *
 * This used to be a bare `cors()`, which sets
 * `Access-Control-Allow-Origin: *` and accepts every origin on the internet.
 * For an API that authenticates with bearer tokens that is not immediately
 * exploitable, but it means any web page can call this API from a victim's
 * browser, and it becomes a real hole the moment cookie auth is added.
 */

/**
 * The allowlist, parsed from CORS_ORIGINS (comma-separated).
 * @returns {string[]}
 */
const allowedOrigins = () =>
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/** True when the API is running in development. */
const isDevelopment = () => process.env.NODE_ENV === "development";

/**
 * Options for the cors middleware.
 *
 * REQUESTS WITH NO ORIGIN ARE ALWAYS ALLOWED, and that is not a loophole. The
 * Origin header is set by browsers; a React Native app, curl, a health probe and
 * server-to-server traffic all send none. Rejecting them would break the mobile
 * app - the primary client - while stopping nothing, because a non-browser
 * caller can set any Origin it likes. CORS only ever constrains browsers.
 *
 * With CORS_ORIGINS unset the allowlist is EMPTY, so no browser origin is
 * permitted. Development is the one exception: an unset list there means "any
 * origin", so Expo's web target and its shifting localhost ports work without
 * anyone maintaining a list. That exception is keyed on NODE_ENV, so it cannot
 * follow the build into staging or production.
 */
export const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins();
    if (allowed.length === 0) return callback(null, isDevelopment());

    return callback(null, allowed.includes(origin));
  },
};

/**
 * Warns at boot when a non-development build has no allowlist.
 *
 * A warning rather than a boot failure, unlike assertAuthConfig: a missing
 * allowlist fails CLOSED, so the API still serves the mobile app correctly and
 * only browser clients are refused. That is a misconfiguration to fix, not a
 * reason to refuse to start and take the whole service down with it.
 *
 * @param {{ warn: (msg: string) => void }} log
 */
export const warnIfCorsUnconfigured = (log) => {
  if (!isDevelopment() && allowedOrigins().length === 0) {
    log.warn(
      "CORS_ORIGINS is not set and NODE_ENV is not development - every browser " +
        "origin will be refused. Non-browser clients, including the mobile app, " +
        "are unaffected.",
    );
  }
};
