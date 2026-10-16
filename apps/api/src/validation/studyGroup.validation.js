import { z } from "zod";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination.validation.js";
import { normalizeJoinCode } from "../services/joinCode.js";

/**
 * Request schemas for the study groups resource.
 *
 * Conventions follow user.validation.js: strictObject everywhere, so an
 * unrecognised key is a loud 400 rather than a silent no-op. That matters more
 * here than on most routers - updateGroup passes its data object through to
 * groupRepo.updateGroup, so before this schema existed an unknown key was
 * handed straight to Prisma.
 */

// study_groups.name is TEXT with no constraint in the Prisma schema, so this is
// the only thing standing between the column and a megabyte of prose.
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SEARCH_LENGTH = 100;

/**
 * Join codes as TYPED. Every code generated today is six characters from
 * services/joinCode.js's alphabet, but groups made before it can still hold an
 * older code - six of base36 from the old generator, or one an owner set back
 * when that was allowed - and those must keep working. So a typed code is
 * bounded loosely, to reject junk rather than to insist on today's shape.
 */
const MIN_JOIN_CODE_LENGTH = 4;
const MAX_JOIN_CODE_LENGTH = 16;
const JOIN_CODE_PATTERN = /^[A-Z0-9]+$/;

const nameSchema = z
  .string()
  .trim()
  .min(1, "name must not be empty")
  .max(MAX_NAME_LENGTH, `name must be at most ${MAX_NAME_LENGTH} characters`);

// .nullish() rather than .optional(): createGroup already writes
// `description ?? null`, so both spellings of "no description" were accepted
// before this schema existed, and null is also how an update CLEARS one.
const descriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_DESCRIPTION_LENGTH,
    `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
  )
  .nullish();

/**
 * groups.id and users.id are both TEXT in Postgres, so an invalid id would
 * otherwise just miss and return a confusing 404 - see sessionIdParamSchema.
 */
export const groupIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

/** The two-segment member routes: DELETE and PATCH under /:id/members/:userId. */
export const groupMemberParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
  userId: z.uuid("userId must be a UUID"),
});

/**
 * POST /api/groups.
 *
 * ownerId is ABSENT by design: the controller takes it from req.user.id, and a
 * client-supplied one would let any caller create a group owned by someone
 * else. joinCode is absent too - createGroup GENERATES one for every group,
 * and a caller-chosen code would be a guessable key. Replacing it later is
 * POST /:id/join-code, which generates another.
 */
export const createGroupSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema,
  isPrivate: z.boolean().optional(),
});

/**
 * PATCH /api/groups/:id.
 *
 * Every field optional, but an empty body is a client bug - without the refine
 * it would return 200 and change nothing. The refine counts KEYS rather than
 * truthy values, so { "description": null } is a change, which it is.
 *
 * ownerId is absent and that absence is load-bearing rather than cosmetic:
 * studyGroup.repository.js keeps transferOwnership as a SEPARATE function
 * precisely so ownerId can never be set through the generic update path, and
 * strictObject is what now enforces at the edge what that comment describes.
 * Sending it is a 400.
 *
 * joinCode is NOT accepted, and sending it is a 400. A code on its own now
 * lets anyone into a group, so it must be one the server generated - an
 * owner-chosen code could be weak, and could collide with another group's.
 * Retiring a leaked code is POST /:id/join-code, which regenerates it.
 */
export const updateGroupSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema,
    isPrivate: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "request body must contain at least one field to update",
  });

/** PATCH /api/groups/:id/owner. */
export const transferOwnershipSchema = z.strictObject({
  newOwnerId: z.uuid("newOwnerId must be a UUID"),
});

/**
 * POST /api/groups/:id/join.
 *
 * joinCode is OPTIONAL, and must stay optional: joining a public group is a
 * request with no body at all, and joinGroup only compares the code when
 * group.isPrivate is set. A required field here would break every public join.
 *
 * Case and spacing are forgiven, in joinGroup itself: every stored code is
 * upper case, so "abc123" can only ever match "ABC123" - it widens nothing a
 * guesser can use. See normalizeJoinCode.
 */
export const joinGroupSchema = z.strictObject({
  joinCode: z.string().trim().max(MAX_JOIN_CODE_LENGTH).optional(),
});

/**
 * POST /api/groups/join - a code alone, the Study tab's "Join a group".
 *
 * Normalised BEFORE it is checked, so "k3p-q7x" is read as the K3PQ7X it
 * means rather than refused for its dash. Bounded loosely - see the note on
 * MIN_JOIN_CODE_LENGTH for the older codes that must still work.
 */
export const joinByCodeSchema = z.strictObject({
  code: z
    .string({ message: "code is required" })
    .transform(normalizeJoinCode)
    .pipe(
      z
        .string()
        .min(MIN_JOIN_CODE_LENGTH, `code must be at least ${MIN_JOIN_CODE_LENGTH} characters`)
        .max(MAX_JOIN_CODE_LENGTH, `code must be at most ${MAX_JOIN_CODE_LENGTH} characters`)
        .regex(JOIN_CODE_PATTERN, "code may only contain letters and numbers"),
    ),
});

/**
 * PATCH /api/groups/:id/members/:userId/role.
 *
 * z.enum replaces the `["MEMBER", "ADMIN"].includes(role)` check that
 * setMemberRole does by hand. The service check stays where it is - it is the
 * last line of defence for any future caller that does not come through this
 * route - but the 400 now names the field and lists the valid values.
 *
 * The literals MUST match the GroupRole enum in the Prisma schema. Prisma
 * generates no runtime value for it in JS, so this is a hand-maintained copy;
 * adding a role means changing both.
 */
export const setMemberRoleSchema = z.strictObject({
  role: z.enum(["MEMBER", "ADMIN"], {
    message: "role must be MEMBER or ADMIN",
  }),
});

/**
 * GET /api/groups.
 *
 * An empty ?q= is normalised to undefined rather than rejected, the same call
 * listUsersQuerySchema makes: a UI with a cleared search box should list
 * everything, not receive a 400. searchGroups already treats undefined as
 * "no filter".
 *
 * Paginated like the user directory, with the same page/limit and the same
 * { data, pagination } envelope - pagination.validation.js owns the cap.
 *
 * `page` has NO default, and that absence is the switch: a request without it
 * comes from an app build older than pagination, which expects the old bare
 * array. The controller answers those in the old shape - see search().
 */
export const searchGroupsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH, `q must be at most ${MAX_SEARCH_LENGTH} characters`)
    .optional()
    .transform((value) => value || undefined),
});