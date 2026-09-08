import { z } from "zod";

/**
 * Request schemas for the bookmarks resource.
 *
 * Conventions follow session.validation.js and post.validation.js: strictObject
 * everywhere, so an unrecognised key is a loud 400 rather than a silent no-op.
 *
 * This file covers EVERY route on the router that takes input, which is a step up
 * from the closest siblings: like.routes.js and block.routes.js validate only
 * their /all query and fall back to a hand-rolled `isId` helper in the controller
 * for everything else. That helper accepts any non-empty string, so a malformed
 * id reaches Postgres and returns a confusing 404 instead of the 400 that says
 * what is actually wrong. New code uses the newer convention.
 */

/**
 * posts.id is TEXT in Postgres rather than a native uuid column, so an invalid id
 * would otherwise just miss and 404. Validating the shape here upgrades that to a
 * 400 that names the field — the same reasoning postIdParamSchema and
 * sessionIdParamSchema give.
 *
 * The param is postId rather than id because this router declares no "/:id" route
 * at all: every single-row path is keyed by the POST, which is the id a client
 * rendering a bookmark icon actually holds. See the note in bookmark.routes.js.
 */
export const bookmarkPostIdParamSchema = z.strictObject({
  postId: z.uuid("postId must be a UUID"),
});

/**
 * POST /api/bookmarks.
 *
 * userId is ABSENT by design and strictObject makes that ENFORCED rather than
 * merely undocumented: the controller takes it from req.user.id, and a
 * client-supplied one would let any caller save a post into someone else's list.
 * Same reasoning that keeps userId out of startSessionSchema.
 *
 * savedAt is absent for the same reason. The server sets it, and a caller-chosen
 * value would let anyone forge their own list ordering — or plant a row dated in
 * the far future that pins itself to the top forever. Nothing moves it after the
 * insert: there is no route on this resource that updates a row at all. See the
 * note at the foot of bookmark.routes.js.
 */
export const createBookmarkSchema = z.strictObject({
  postId: z.uuid("postId must be a UUID"),
});
