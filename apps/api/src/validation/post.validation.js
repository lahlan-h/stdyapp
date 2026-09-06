import { z } from "zod";


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
 *
 * ONE OF THESE PARSES MULTIPART, NOT JSON. createPostSchema is applied to the
 * text fields multer puts on req.body, which means every value it sees is a
 * STRING - there are no numbers, booleans or nulls in a multipart body. That is
 * why the optional links need the empty-string normalisation below, and why the
 * three-state link semantics live on updatePostSchema, which is still JSON.
 */

// Post.caption is TEXT in Postgres with no length constraint, so this is the
// only thing standing between the column and a megabyte of prose. Generous for
// a study-session caption and far below anything that would hurt.
const MAX_CAPTION_LENGTH = 2000;

/**
 * The optional links, as a uuid.
 *
 * Tighter than the isValidLink() this replaces, which accepted ANY non-empty
 * string and left Prisma to miss and 404. Both ids are @default(uuid()) in the
 * schema, so a non-uuid can never match a row - answering 400 with the reason is
 * strictly better than a 404 that implies the row merely does not exist.
 */
const linkSchema = z.uuid();

/**
 * The same link, as it arrives on a MULTIPART form.
 *
 * An empty part is how a form says "nothing selected": a client that renders a
 * session picker and leaves it blank sends `sessionId=` rather than omitting the
 * field, and a bare z.uuid() would answer 400 for what the user meant as "no
 * session". Normalising "" to undefined first makes the two spellings identical.
 *
 * The same call listUsersQuerySchema makes for an empty ?q= in
 * user.validation.js, and for the same reason: a cleared input should behave
 * like an absent one.
 */
const formLinkSchema = z
  .string()
  .optional()
  .transform((value) => value || undefined)
  .pipe(linkSchema.optional());

const captionSchema = z
  .string()
  .trim()
  .min(1, "caption must not be empty")
  .max(MAX_CAPTION_LENGTH, `caption must be at most ${MAX_CAPTION_LENGTH} characters`);

/**
 * POST /api/posts - the text fields of the multipart body.
 *
 * The FILE is not described here. multer puts it on req.file, outside req.body,
 * so Zod never sees it - uploadImage() guarantees it is a non-empty Buffer within
 * the size cap, and utils/imageType.js decides whether it is really an image.
 *
 * Neither photoUrl NOR photoKey appears, and strictObject makes that absence
 * enforced rather than merely undocumented: a client sending either gets a 400
 * that says so. Nothing client-supplied may name an object in our bucket - a
 * caller-chosen value could name one they do not own, which the delete path would
 * then remove on their behalf. Same reasoning that removed avatarUrl from
 * createUserSchema. The server derives photoUrl from the key it just wrote.
 */
export const createPostSchema = z.strictObject({
  caption: captionSchema,
  sessionId: formLinkSchema,
  routineId: formLinkSchema,
});

/**
 * PATCH /api/posts/:id - caption and links only.
 *
 * NO photo of any kind: a post's photo is fixed at creation. Changing it would
 * mean uploading, rewriting the row and reclaiming the old object - the create
 * path plus a delete - and "delete the post, post again" already expresses that.
 * If a photo edit is ever wanted it belongs on its own route, not smuggled into
 * a PATCH.
 *
 * This one is still JSON, which is what lets the links be three-state. A
 * multipart body cannot express null - every value in it is a string - so an
 * explicit detach is only sayable here.
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
