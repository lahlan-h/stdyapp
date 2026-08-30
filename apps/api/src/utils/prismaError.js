import { createLogger } from "@stdyapp/core";

import { HttpError } from "./httpError.js";

const log = createLogger("users");

/**
 * Translates Prisma failures into HTTP errors.
 *
 * Lives in utils/ rather than in user.service.js because the same three codes
 * will recur for every one of the 14 ERD entities still to be built.
 *
 * NOTE: this duck-types on the error's shape instead of importing
 * `Prisma.PrismaClientKnownRequestError`. @prisma/client is a dependency of
 * @stdyapp/core, NOT of @stdyapp/api - it only resolves from here because npm
 * hoists it to the root node_modules. Importing it would be an undeclared
 * dependency that breaks the moment hoisting changes, which is exactly the
 * "works on my machine" failure the README exists to prevent.
 */

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";
const PRISMA_RECORD_NOT_FOUND = "P2025";

// Prisma error codes are always "P" followed by four digits.
const PRISMA_ERROR_CODE_PATTERN = /^P\d{4}$/;

// Fields whose conflicts we are willing to name in a client-visible message.
// Anything not listed here falls back to a generic message rather than leaking
// an internal column name.
const CONFLICT_FIELD_LABELS = { email: "Email", username: "Username" };

/**
 * Identifies a PrismaClientKnownRequestError without importing Prisma.
 *
 * Checks `clientVersion` as well as `code` because a plain object with a `code`
 * property (a Node fs error, for instance) would otherwise match.
 *
 * @param {any} err
 * @returns {boolean}
 */
const isPrismaKnownRequestError = (err) =>
  typeof err?.code === "string" &&
  PRISMA_ERROR_CODE_PATTERN.test(err.code) &&
  typeof err?.clientVersion === "string";

/**
 * Names the field behind a P2002 unique-constraint violation.
 *
 * `meta.target` is an array of field names on most Postgres versions but has
 * historically been the raw index name ("users_email_key"). Substring matching
 * over the joined value handles both without sniffing versions.
 *
 * @param {any} err
 * @returns {string} a client-safe message
 */
const describeUniqueConflict = (err) => {
  const target = err?.meta?.target;
  const parts = Array.isArray(target) ? target : [target].filter(Boolean);
  const haystack = parts.join(",");

  const match = Object.keys(CONFLICT_FIELD_LABELS).find((field) =>
    haystack.includes(field),
  );

  return match
    ? `${CONFLICT_FIELD_LABELS[match]} is already in use`
    : "That value is already in use";
};

/**
 * Converts any thrown value into an HttpError that is always safe to send.
 *
 * @param {unknown} err - the caught error
 * @param {{ notFoundMessage?: string, conflictMessage?: string }} [messages]
 *   Resource-specific wording, so the generic mapping can still say "User not
 *   found" rather than "Resource not found".
 * @returns {HttpError}
 */
export const toHttpError = (err, messages = {}) => {
  const {
    notFoundMessage = "Resource not found",
    conflictMessage = "This record is still referenced by other data",
  } = messages;

  // Already classified (e.g. a 404 the service raised itself) - pass through.
  if (err instanceof HttpError) return err;

  if (isPrismaKnownRequestError(err)) {
    switch (err.code) {
      case PRISMA_UNIQUE_VIOLATION:
        return new HttpError(409, describeUniqueConflict(err), { cause: err });
      case PRISMA_RECORD_NOT_FOUND:
        return new HttpError(404, notFoundMessage, { cause: err });
      case PRISMA_FOREIGN_KEY_VIOLATION:
        return new HttpError(409, conflictMessage, { cause: err });
      default:
        break;
    }
  }

  // Unrecognised. The error middleware in index.js echoes err.message straight
  // to the client, and Prisma connection errors embed the database host and
  // user - so log the real error here and hand back a generic one.
  log.error("unhandled database error", err);
  return new HttpError(500, "Internal server error", { cause: err });
};
