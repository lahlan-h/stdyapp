import { z } from "zod";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./pagination.validation.js";

/**
 * Request schemas for the users resource.
 *
 * Named validation/ rather than schemas/ so "schema" keeps meaning the Prisma
 * schema in conversation.
 */

// bcrypt ignores everything past 72 BYTES - not characters. A longer password
// is silently truncated, which would later let a user authenticate with a mere
// prefix of their own password. Reject it loudly instead of storing a hash of
// something the user did not type.
const BCRYPT_MAX_PASSWORD_BYTES = 72;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_SEARCH_LENGTH = 100;

// Re-exported so this module stays the one place the users resource is
// described, while the numbers themselves live with the shared schema.
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };

// Normalise BEFORE validating. .pipe() guarantees the trim/lowercase runs
// first, so " Ada@UTS.edu.au " is accepted and stored as "ada@uts.edu.au".
// Chaining .trim() AFTER z.email() would validate the untrimmed string and
// reject it.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("must be a valid email address"));

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "username must be at least 3 characters")
  .max(30, "username must be at most 30 characters")
  .regex(
    USERNAME_PATTERN,
    "username may only contain letters, numbers and underscores",
  );

// Shared by firstName and lastName here, and re-exported for the required
// variants in auth.validation.js. min(1) runs AFTER trim, so "   " is rejected
// rather than stored as an empty name.
export const nameSchema = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(MAX_NAME_LENGTH, `must be at most ${MAX_NAME_LENGTH} characters`);

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  )
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_PASSWORD_BYTES,
    `password must be at most ${BCRYPT_MAX_PASSWORD_BYTES} bytes`,
  );

// z.url() accepts ANY scheme, including javascript: and data:. If the web app
// ever renders this in an href rather than an img src, that is stored XSS - so
// restrict it to http(s) here, at the only point where the value enters.
//
// The try/catch is not redundant: Zod runs every check on a value rather than
// stopping at the first failure, so this refinement can still see a string that
// z.url() already rejected, and a bare new URL() would throw.
const avatarUrlSchema = z
  .url("must be a valid URL")
  .max(MAX_URL_LENGTH)
  .refine((value) => {
    try {
      return SAFE_URL_PROTOCOLS.has(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "avatarUrl must use http or https");

/**
 * strictObject (not object) rejects unknown keys with a 400 instead of silently
 * stripping them. Loud beats quiet for an API contract: a client sending
 * {"passwordHash": "..."} or {"id": "..."} is told it is wrong rather than
 * being left to wonder why it had no effect.
 *
 * `lastActiveAt` is absent by design - it is server-owned, so a client must not
 * be able to fake "studying right now".
 */
export const createUserSchema = z.strictObject({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  // Optional HERE but required at signup: this schema also backs
  // PATCH /api/users/:id, where every field must stay optional. The required
  // variant lives in auth.validation.js.
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  avatarUrl: avatarUrlSchema.optional(),
  bio: z.string().trim().max(MAX_BIO_LENGTH).optional(),
});

/**
 * PATCH semantics: every field optional, but an empty body is a client bug -
 * without the refine it would return 200 and change nothing.
 *
 * `password` is OMITTED, resolving the TODO(auth) that stood here while the API
 * was unauthenticated. A password change must prove knowledge of the CURRENT
 * password - otherwise anyone holding a stolen access token could lock the real
 * owner out of their account permanently, which is a far worse outcome than the
 * 15 minutes of access the stolen token was already worth.
 *
 * Because this is a strictObject, sending `password` here is now a loud 400
 * rather than a silent no-op. The replacement is a dedicated authenticated
 * endpoint (POST /api/auth/change-password) taking currentPassword +
 * newPassword and revoking every other session on success - not yet built.
 */
export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "request body must contain at least one field to update",
  });

/**
 * Query params always arrive as strings, hence z.coerce.
 *
 * An empty ?q= is normalised to undefined rather than rejected: a UI with a
 * cleared search box should list everyone, not receive a 400.
 */
export const listUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH)
    .optional()
    .transform((value) => value || undefined),
});

/**
 * users.id is TEXT in Postgres, not a native uuid column, so an invalid id
 * would otherwise just miss and return a confusing 404. Validating the shape
 * here upgrades that to a 400 that says what is actually wrong.
 */
export const userIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});
