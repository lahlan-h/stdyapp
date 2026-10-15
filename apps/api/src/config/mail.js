/**
 * Outgoing mail (Gmail SMTP) and the password-reset tuning constants.
 *
 * Nothing here reads process.env at MODULE SCOPE - see the top of ./auth.js for
 * why. Every value is read at call time, after ./env.js has loaded the root .env.
 */

export const GMAIL_SMTP_HOST = "smtp.gmail.com";

// Implicit TLS from the first byte. 587 + STARTTLS also works with Gmail, but
// 465 cannot be downgraded to plaintext by anything sitting in the middle.
export const GMAIL_SMTP_PORT = 465;

// Six characters, matching the six slots on the mobile screen.
export const RESET_CODE_LENGTH = 6;

// Long enough to switch to a mail app and back; short enough that a code left in
// an inbox is useless by the time anyone else reads it.
export const RESET_CODE_TTL_MIN = 10;

/**
 * Wrong guesses allowed against ONE code before it is dead.
 *
 * The code alphabet has 32 symbols, so a code is one of 32^6 ≈ 1.07 billion.
 * Five guesses per code, and three codes per email per 15 minutes (see
 * RATE_LIMIT_RESET_REQUEST), make guessing hopeless - the per-code cap is what
 * does the work, since the rate limiter fails open when Redis is down.
 */
export const RESET_CODE_MAX_ATTEMPTS = 5;

// How long the reset token from a verified code stays good for - the time a
// user has to choose a new password.
export const RESET_TOKEN_TTL_MIN = 15;

/**
 * The Gmail account the API sends as, or null when mail is not set up.
 *
 * Optional, like Google sign-in (see getGoogleClientIds in ./auth.js): without
 * it POST /api/auth/forgot-password answers 503 and the rest of the API is fine.
 *
 * GMAIL_APP_PASSWORD is a 16-character App Password, NOT the account password -
 * Gmail refuses SMTP logins with the real one. Google shows it in groups of four
 * with spaces, which are stripped here so it can be pasted as shown.
 *
 * MAIL_FROM is optional. Gmail rewrites the address part to the signed-in
 * account (or one of its verified "Send mail as" aliases) whatever it says, so
 * it is only really useful for the display name.
 *
 * @returns {{ user: string, pass: string, from: string } | null}
 */
export const getMailConfig = () => {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!user || !pass) return null;

  const from = process.env.MAIL_FROM?.trim() || `"stdy" <${user}>`;
  return { user, pass, from };
};
