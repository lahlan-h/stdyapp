/**
 * Limits for the binary upload routes.
 *
 * IMPORTANT: nothing here reads process.env at MODULE SCOPE, the rule documented
 * in ./auth.js, ./cache.js and packages/core/src/redis.js. These are all
 * compile-time constants today, so the rule costs nothing to keep — but the
 * moment one of them becomes tunable it must become a getter function, not a
 * module-scope read, or it will be evaluated before ./env.js has loaded the root
 * .env.
 */

/**
 * Hard ceiling on an avatar, enforced by uploadImage() while the part is still
 * streaming — body-parser aborts at this many bytes rather than buffering the
 * whole request and measuring afterwards.
 *
 * 5 MB is generous for a profile picture and deliberately so: this API does no
 * resizing, so the number has to cover an unmodified photo straight off a phone
 * camera. It is the value that appears in the 413 message, so change both
 * together.
 */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * The Content-Type values uploadImage() will accept on any photo upload.
 *
 * This list gates the PARSER only. It is not the security boundary — a client
 * can claim any of these for any bytes, so utils/imageType.js re-derives the
 * real type from the file's magic bytes and that is what gets stored. See the
 * doc block there for why trusting the header would be stored XSS.
 *
 * GIF is absent on purpose: an animated avatar is a product decision nobody has
 * made, and the first frame of a large GIF is not worth the bytes.
 */
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * The name the avatar route already mounts with, kept as an alias.
 *
 * One list rather than one per surface, unlike the size caps, and that is not an
 * inconsistency: a cap is a policy choice per surface, whereas this is simply
 * the set of formats utils/imageType.js can identify. A second copy could only
 * ever be wrong - accepting something the sniffer then rejects with a 415, or
 * refusing something it handles fine.
 */
export const AVATAR_MIME_TYPES = IMAGE_MIME_TYPES;

/**
 * Hard ceiling on a post photo.
 *
 * A SEPARATE constant from MAX_AVATAR_BYTES even though the number matches
 * today, following the rule config/cache.js states about its own tiers:
 * separate constants even where the number happens to match, because they
 * describe different surfaces. A post photo is the content of the app; an avatar
 * is chrome. Raising one should not silently raise the other.
 */
export const MAX_POST_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Photos on one post. Mirrored by MAX_POST_PHOTOS in the app's useCreatePost.ts
 * - the API cannot import @stdyapp/shared, which is TypeScript - so change both.
 *
 * Five, as Facebook's post grid shows them: two across the top and three below.
 * Past five Facebook overlays a "+N", which a study post does not need - this
 * is a session, not an album.
 */
export const MAX_POST_PHOTOS = 5;

/**
 * How long a presigned upload URL works. Long enough for five photos on a slow
 * phone connection; short enough that a leaked URL is worth nothing by the time
 * anyone could use it. It allows one PUT, to one key the API chose.
 */
export const PHOTO_UPLOAD_URL_TTL_SEC = 5 * 60;

/**
 * How long an uploaded photo may sit unattached to a post before the sweep
 * deletes it. Comfortably past PHOTO_UPLOAD_URL_TTL_SEC plus the time it takes
 * to write a caption - someone mid-post must never lose their photos.
 */
export const PHOTO_UPLOAD_TTL_MS = 60 * 60 * 1000;

/**
 * The largest width or height the app may declare for a photo. Display-only -
 * see PostPhoto.width - but bounded so a nonsense value cannot reach the feed.
 */
export const MAX_PHOTO_DIMENSION = 20_000;
