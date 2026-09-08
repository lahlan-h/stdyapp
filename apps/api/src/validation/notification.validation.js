import { z } from "zod";

import { paginationQuerySchema } from "./pagination.validation.js";

/**
 * Request schemas for the notifications resource.
 *
 * Like streaks, this resource has no CREATE schema: nothing on the wire makes a
 * notification. The only writer is emitNotification() in
 * notification.service.js. A client that could post its own notifications could
 * put arbitrary text in its own feed, and - more to the point - in a future
 * push payload, which is a phishing surface rather than a feature.
 *
 * What a client CAN do is read them, mark them read, and delete them. That is
 * the whole of the write surface, and none of it carries a body.
 */

/**
 * PATCH /:id/read and DELETE /:id.
 *
 * notifications.id is TEXT in Postgres, so an invalid id would otherwise just
 * miss and produce a confusing 404 - see sessionIdParamSchema.
 */
export const notificationIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

/**
 * A boolean that arrived as a query string.
 *
 * Query params are ALWAYS strings, so z.boolean() would reject "true" outright
 * and z.coerce.boolean() is worse than useless here - it applies JavaScript
 * truthiness, under which the string "false" is true. Every ?unreadOnly=false
 * would then filter to unread only, which is the exact opposite of what was
 * asked and would fail silently.
 *
 * An explicit two-value enum is the only spelling that gets this right, and it
 * also makes ?unreadOnly=yes a 400 naming the field rather than a guess.
 */
const queryBooleanSchema = z
  .enum(["true", "false"], { message: "must be true or false" })
  .transform((value) => value === "true");

/**
 * GET /api/notifications.
 *
 * Extends the shared pagination schema rather than redeclaring page and limit,
 * exactly as listUsersQuerySchema does: MAX_PAGE_SIZE is a whole-API concern
 * and a second copy of that number is a second place for it to drift.
 *
 * .optional() rather than .default(false) on unreadOnly so the service can tell
 * "not asked for" from "explicitly asked for all", which is what keeps the
 * where-clause it builds free of a redundant `isRead: undefined`.
 */
export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: queryBooleanSchema.optional(),
});
