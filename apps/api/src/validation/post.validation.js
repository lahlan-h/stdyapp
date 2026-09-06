import { z } from "zod";

import { IMAGE_EXTENSIONS } from "../utils/imageType.js";
import { TMP_PREFIX } from "../services/photoStorage.service.js";

/**
 * Request schemas for the posts resource.
 *
 * Only the WRITE routes are covered. The reads on this router keep their
 * existing hand-rolled shape, so this file is deliberately not a full migration
 * of post.controller.js to Zod - it exists because the create path was being
 * rewritten anyway, and hand-rolling the same checks a fourth time was the worse
 * of the two options.
 *
 * Conventions follow user.validation.js: strictObject everywhere, so an
 * unrecognised key is a loud 400 rather than a silent no-op.
 */

// Post.caption is TEXT in Postgres with no length constraint, so this is the
// only thing standing between the column and a megabyte of prose. Generous for
// a study-session caption and far below anything that would hurt.
const MAX_CAPTION_LENGTH = 2000;

// prefix/owner/filename, so two separators.
const KEY_SEGMENTS = 3;

// Long enough for the layout below with room to spare; short enough that a
// pathological string is rejected before any of the work above.
const MAX_PHOTO_KEY_LENGTH = 256;

/**
 * The staged key returned by POST /api/posts/photo.
 *
 * SHAPE ONLY. This deliberately does NOT check that the key belongs to the
 * caller, because a schema has no access to req.user - that check lives in
 * post.service.js, where the owner is in scope, and it answers 403 rather than
 * 400. Splitting them this way keeps "malformed" and "not yours" as different
 * answers, which is the same reason users.routes.js runs validate() before
 * requireSelf.
 *
 * The extension list is derived from imageType.js rather than retyped, so adding
 * a format there cannot leave this rejecting keys the upload path has just
 * issued.
 *
 * Must be a TMP_PREFIX key: a client may only reference something it has
 * staged, never a "posts/" key that already backs a row.
 */
const photoKeySchema = z
  .string()
  .max(MAX_PHOTO_KEY_LENGTH)
  .refine((value) => {
    const segments = value.split("/");
    if (segments.length !== KEY_SEGMENTS) return false;
    if (segments[0] !== TMP_PREFIX) return false;

    return new RegExp(`^[0-9a-f-]{36}\\.(${IMAGE_EXTENSIONS.join("|")})$`).test(
      segments[2],
    );
  }, "photoKey must be a key returned by POST /api/posts/photo");

/**
 * The optional links, as a uuid.
 *
 * Tighter than the isValidLink() this replaces, which accepted ANY non-empty
 * string and left Prisma to miss and 404. Both ids are @default(uuid()) in the
 * schema, so a non-uuid can never match a row - answering 400 with the reason is
 * strictly better than a 404 that implies the row merely does not exist.
 */
const linkSchema = z.uuid();

const captionSchema = z
  .string()
  .trim()
  .min(1, "caption must not be empty")
  .max(MAX_CAPTION_LENGTH, `caption must be at most ${MAX_CAPTION_LENGTH} characters`);

/**
 * POST /api/posts - the second half of the two-step upload.
 *
 * `photoUrl` is ABSENT by design, and its absence is enforced rather than
 * ignored: strictObject turns a client still sending one into a 400 that says
 * so. It stopped being client input because a caller-chosen URL could name an
 * object in our own bucket that they did not own, which the delete path would
 * then have removed on their behalf - the same reasoning that removed avatarUrl
 * from createUserSchema. The server now derives photoUrl from photoKey.
 */
export const createPostSchema = z.strictObject({
  caption: captionSchema,
  photoKey: photoKeySchema,
  sessionId: linkSchema.optional(),
  routineId: linkSchema.optional(),
});

/**
 * PATCH /api/posts/:id - caption and links only.
 *
 * NO photoKey and no photoUrl: a post's photo is fixed at creation. Changing it
 * would mean uploading, promoting, rewriting the row and reclaiming the old
 * object, which is the create path plus a delete - and "delete the post, post
 * again" already expresses that. If a photo edit is ever wanted, it belongs on
 * its own route, not smuggled into a JSON PATCH.
 *
 * The links are THREE-STATE, and .nullish() is what preserves that. The
 * semantics are documented above updatePost in services/post.service.js:
 *
 *   key absent (undefined) -> leave as-is   (Prisma skips undefined fields)
 *   "sessionId": "<uuid>"  -> attach        (ownership checked first)
 *   "sessionId": null      -> detach        (Prisma writes NULL)
 *
 * The refine is what stops an empty body returning 200 having changed nothing.
 * It counts KEYS rather than truthy values, so { "sessionId": null } is a
 * change - which it is.
 */
export const updatePostSchema = z
  .strictObject({
    caption: captionSchema.optional(),
    sessionId: linkSchema.nullish(),
    routineId: linkSchema.nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "request body must contain at least one field to update",
  });

/**
 * posts.id is TEXT in Postgres rather than a native uuid column, so an invalid
 * id would otherwise just miss and return a confusing 404.
 *
 * Mounting this on the /:id routes has a second effect worth knowing about: it
 * is what makes GET /api/posts/photo answer "id must be a UUID" instead of
 * "Post not found". A single-segment :id pattern matches the literal "photo",
 * so before this the router answered a confidently wrong 404 - exactly the trap
 * the comment above the /all route warns about.
 */
export const postIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});
