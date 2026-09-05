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
 * Hard ceiling on an avatar, enforced by rawImage() while the body is still
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
 * The Content-Type values rawImage() will accept on an avatar upload.
 *
 * This list gates the PARSER only. It is not the security boundary — a client
 * can claim any of these for any bytes, so utils/imageType.js re-derives the
 * real type from the file's magic bytes and that is what gets stored. See the
 * doc block there for why trusting the header would be stored XSS.
 *
 * GIF is absent on purpose: an animated avatar is a product decision nobody has
 * made, and the first frame of a large GIF is not worth the bytes.
 */
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
