import { z } from "zod";

import { paginationQuerySchema } from "./pagination.validation.js";

/**
 * Request schemas for the posts resource.
 *
 * The WRITE routes, plus the one read that takes a query string: GET /all, whose
 * sort and date window are described by listAllPostsQuerySchema at the bottom.
 * The other reads keep their existing hand-rolled shape, so this file is
 * deliberately not a full migration of post.controller.js to Zod - it exists
 * because the create path was being rewritten anyway, and hand-rolling the same
 * checks a fourth time was the worse of the two options.
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

// Post.title is TEXT too, and bounded here for the same reason. Much tighter
// than the caption because it is a headline: it renders as one bold line on a
// feed card, and anything longer than this wraps into a paragraph and stops
// reading as a title at all. Matches the cap on StudyRoutine.title.
const MAX_TITLE_LENGTH = 100;

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

const titleSchema = z
  .string()
  .trim()
  .min(1, "title must not be empty")
  .max(MAX_TITLE_LENGTH, `title must be at most ${MAX_TITLE_LENGTH} characters`);

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
  title: titleSchema,
  // Optional: a title and a photo are a complete post. Note this cannot use the
  // empty-string normalisation the links use - a caption is free text, so ""
  // has to be rejected as "you typed nothing" rather than read as "absent". The
  // client omits the field entirely when there is no caption.
  caption: captionSchema.optional(),
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
    // Inside the literal, not bolted on with .extend(): the .refine below makes
    // this a ZodEffects, which has no .extend().
    title: titleSchema.optional(),
    caption: captionSchema.nullish(),
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

/**
 * The orders the global feed can be read in.
 *
 * Exported so the repository's orderBy map is keyed by the same list: a sort
 * accepted here with no entry there would reach Prisma as `undefined` and
 * quietly fall back to its default order.
 *
 * "most_liked" is all-time likes on each post, not likes received inside the
 * date window - Like has no timestamp (see the note on the model), so the window
 * can only ever narrow WHICH posts are ranked, never what they are ranked by.
 */
export const FEED_SORTS = [
  "recent",
  "oldest",
  "most_liked",
  "least_liked",
  "most_commented",
  "least_commented",
];

/**
 * One end of the date window, as an ISO-8601 instant.
 *
 * An INSTANT, not a calendar day, and that is the whole timezone story: the app
 * turns "6 Oct" into its own local midnight before sending, so the server never
 * has to know which zone the reader is in - the same reason calendar.js can stay
 * UTC-only. `offset: true` accepts "+10:00" as well as "Z", since both name one
 * moment unambiguously.
 */
const instantSchema = z.iso
  .datetime({ offset: true, message: "must be an ISO-8601 date-time" })
  .transform((value) => new Date(value));

/**
 * GET /api/posts/all - a page of the feed, in a chosen order, inside an
 * optional window.
 *
 * Extends the shared pagination schema rather than copying it, so the page cap
 * stays in one place. Still strict: a typo'd ?srot= is a 400, not page one in
 * the default order.
 *
 * The window is HALF-OPEN, [from, to): `from` is inclusive and `to` exclusive.
 * That is what lets a client ask for "all of the 6th" as midnight-to-midnight
 * without a post at exactly 00:00 on the 7th landing on both days. Either end
 * may be given alone.
 */
export const listAllPostsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(FEED_SORTS).default("recent"),
    from: instantSchema.optional(),
    to: instantSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    message: "to must be later than from",
    path: ["to"],
  });
