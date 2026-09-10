import { z } from "zod";

/**
 * Offset-pagination query params, shared by every paginated list endpoint.
 *
 * Lives here rather than beside one resource's schemas because the page cap is
 * a whole-API concern: it is the thing standing between a client and
 * "?limit=999999", and a second copy of that number is a second place for it to
 * drift. user.validation.js imports these constants back for
 * listUsersQuerySchema, which adds its own ?q on top.
 */

export const DEFAULT_PAGE_SIZE = 20;
// A hard cap, not a suggestion: without it, ?limit=999999 is a free denial of
// service against any list endpoint.
export const MAX_PAGE_SIZE = 100;

/**
 * Query params always arrive as strings, hence z.coerce.
 *
 * strictObject rather than object: an unrecognised param is almost always a
 * client bug — a typo'd ?pge=2 that silently returns page 1 is far harder to
 * diagnose than a 400 naming the field.
 *
 * Both fields have defaults, so an absent query string is valid and yields
 * page 1 at the default size.
 */
export const paginationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
