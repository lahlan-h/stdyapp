import { z } from "zod";

import { paginationQuerySchema } from "./pagination.validation.js";
import {
  IMAGE_MIME_TYPES,
  MAX_PHOTO_DIMENSION,
  MAX_POST_PHOTOS,
  MAX_POST_PHOTO_BYTES,
} from "../config/upload.js";

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
 * All JSON. Creating a post used to be multipart, carrying the photo; photos
 * now go straight to R2 through presigned URLs (createPhotoUploadsSchema) and
 * the post only names them by id.
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
 * POST /api/posts/photos - "I am about to upload these", one entry per photo.
 *
 * Answered with a presigned PUT URL for each, bound to the declared mimeType
 * AND the declared sizeBytes - R2 refuses an upload that differs in either, so
 * the size cap below is enforced at upload time. The bytes themselves are only
 * trusted once verifyUploadedPhoto has sniffed them, when the post is created.
 * width and height are display-only - see PostPhoto.width.
 */
export const createPhotoUploadsSchema = z.strictObject({
  photos: z
    .array(
      z.strictObject({
        mimeType: z.enum(IMAGE_MIME_TYPES),
        sizeBytes: z
          .number()
          .int()
          .min(1)
          .max(MAX_POST_PHOTO_BYTES, `each photo must be at most ${MAX_POST_PHOTO_BYTES / (1024 * 1024)} MB`),
        width: z.number().int().min(1).max(MAX_PHOTO_DIMENSION).optional(),
        height: z.number().int().min(1).max(MAX_PHOTO_DIMENSION).optional(),
      }),
    )
    .min(1, "photos must not be empty")
    .max(MAX_POST_PHOTOS, `a post can have at most ${MAX_POST_PHOTOS} photos`),
});

/**
 * POST /api/posts.
 *
 * photoIds name uploads from POST /api/posts/photos, in display order. The
 * rule that a post needs photos OR a caption lives in post.service.js, beside
 * the check that each photo really arrived - it is one rule about one post.
 *
 * Still no photoUrl and no key: nothing client-supplied may name an object in
 * our bucket. An id only points at a row the API created for this caller.
 */
/**
 * The most groups one post can be shared to. A ceiling on a list the client
 * fills in, and far above how many groups anyone posts a session to.
 */
export const MAX_SHARE_GROUPS = 20;

export const createPostSchema = z.strictObject({
  title: titleSchema,
  // Who the post is for - see Post.shareToFollowers. Both optional: a client
  // that predates sharing sends neither and gets followers, as before. Sending
  // neither audience on purpose (false and no groups) is refused by the
  // service, which is where "at least one" is decided.
  shareToFollowers: z.boolean().optional(),
  groupIds: z
    .array(linkSchema)
    .max(MAX_SHARE_GROUPS, `a post can be shared to at most ${MAX_SHARE_GROUPS} groups`)
    .refine((ids) => new Set(ids).size === ids.length, "groupIds must not repeat")
    .optional(),
  // Omitted rather than "" when there is no caption - "" is refused as "you
  // typed nothing" by captionSchema.
  caption: captionSchema.optional(),
  sessionId: linkSchema.optional(),
  routineId: linkSchema.optional(),
  photoIds: z
    .array(linkSchema)
    .max(MAX_POST_PHOTOS, `a post can have at most ${MAX_POST_PHOTOS} photos`)
    .refine((ids) => new Set(ids).size === ids.length, "photoIds must not repeat")
    .optional(),
});

/**
 * PATCH /api/posts/:id - caption and links only.
 *
 * NO photos of any kind: a post's photos are fixed at creation. Changing them
 * would mean uploading, reattaching and reclaiming the old objects - the create
 * path plus a delete - and "delete the post, post again" already expresses that.
 * If a photo edit is ever wanted it belongs on its own route, not smuggled into
 * a PATCH.
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
/**
 * Whose posts the feed shows. Mirrors FeedAudience in the mobile app's
 * feedFilters.ts, which no longer offers "everyone".
 *
 *   everyone  - every post shared to followers, plus the viewer's own: the
 *               DEFAULT, so a client that predates this parameter sees what it
 *               always did. A group-only post is never in it.
 *   following - the viewer's own posts and the followers-shared posts of
 *               everyone they follow
 *   group     - the posts SHARED to one study group; needs groupId, and the
 *               viewer must be a member (see listAllPosts)
 */
export const FEED_AUDIENCES = ["everyone", "following", "group"];

export const listAllPostsQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(FEED_SORTS).default("recent"),
    from: instantSchema.optional(),
    to: instantSchema.optional(),
    audience: z.enum(FEED_AUDIENCES).default("everyone"),
    groupId: z.uuid("groupId must be a UUID").optional(),
  })
  .refine((query) => !query.from || !query.to || query.from < query.to, {
    message: "to must be later than from",
    path: ["to"],
  })
  // Both directions are a 400. A group feed with no group has nothing to
  // show, and a stray groupId on any other audience would be silently ignored -
  // which reads to the caller as "filtered" when it was not.
  .refine((query) => (query.audience === "group") === Boolean(query.groupId), {
    message: "groupId is required with audience=group, and only then",
    path: ["groupId"],
  });
