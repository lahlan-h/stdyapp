import { z } from "zod";

import {
  createUserSchema,
  nameSchema,
} from "./user.validation.js";

/**
 * Request schemas for the auth resource.
 *
 * The field-level rules (email normalisation, the username pattern, the 72-byte
 * bcrypt guard) are imported from user.validation.js rather than restated.
 * Two copies of a password rule is exactly the kind of drift that ends with
 * signup and profile-update disagreeing about what a valid password is.
 */

// Bounded so an unauthenticated endpoint cannot be handed a megabyte to hash or
// look up. Comfortably above the 30-char username cap and any real email.
const MAX_IDENTIFIER_LENGTH = 320;

// Refresh tokens are 32 bytes base64url-encoded, so 43 characters. The cap only
// stops something absurd reaching the hash function; the exact length is not
// worth asserting, since a wrong-length token simply fails to match.
const MAX_TOKEN_LENGTH = 512;

/**
 * POST /api/auth/register
 *
 * createUserSchema with the names made REQUIRED. They are optional there
 * because that schema also backs PATCH /api/users/:id, where everything must be
 * optional - but an account should not be created without a real name.
 *
 * .extend() on a strictObject stays strict, so unknown keys are still a 400.
 */
export const registerSchema = createUserSchema.extend({
  firstName: nameSchema,
  lastName: nameSchema,
});

/**
 * POST /api/auth/login
 *
 * One `identifier` field rather than separate email/username: the client should
 * not have to guess which one the user typed, and accepting both is what users
 * expect from a login box.
 *
 * The password here is a bare non-empty string, deliberately NOT passwordSchema.
 * Enforcing the signup policy at login would 400 on a password that is merely
 * wrong, publishing the policy to anyone probing the endpoint and breaking any
 * account whose password predates a future rule change. Login has exactly one
 * failure mode, and it is 401.
 */
export const loginSchema = z.strictObject({
  identifier: z
    .string()
    .trim()
    .min(1, "identifier is required")
    .max(MAX_IDENTIFIER_LENGTH),
  password: z.string().min(1, "password is required").max(MAX_TOKEN_LENGTH),
});

/**
 * POST /api/auth/refresh and POST /api/auth/logout
 *
 * Not trimmed: base64url contains no whitespace, so a token arriving with any
 * is already wrong, and trimming would only mask a client bug.
 */
export const refreshTokenSchema = z.strictObject({
  refreshToken: z
    .string()
    .min(1, "refreshToken is required")
    .max(MAX_TOKEN_LENGTH),
});
