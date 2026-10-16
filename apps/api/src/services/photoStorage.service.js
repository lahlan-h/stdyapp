import { randomUUID } from "node:crypto";

import {
  uploadFile,
  deleteFile,
  deleteFiles,
  publicUrlForKey,
  createUploadUrl,
  headFile,
  readFileStart,
  createLogger,
} from "@stdyapp/core";
import { HttpError } from "../utils/httpError.js";
import {
  detectImageType,
  extensionForMime,
  IMAGE_EXTENSIONS,
  SNIFF_BYTES,
} from "../utils/imageType.js";
import { PHOTO_UPLOAD_URL_TTL_SEC } from "../config/upload.js";

/**
 * Object-storage policy for user-uploaded photos, shared by avatars and posts.
 *
 * This layer owns what an object is CALLED, which bytes are acceptable, and -
 * most importantly - which objects a given caller is entitled to delete. It
 * knows nothing about users, posts or Prisma; the domain services own that and
 * call in here.
 *
 * Extracted from avatar.service.js when posts needed the same guarantees. The
 * ownership check below is security-critical, and a second copy of it would be a
 * second place for it to drift out of agreement with the first.
 *
 * KEY LAYOUT, which the whole module depends on:
 *
 *   <prefix>/<ownerId>/<uuid>.<ext>
 *
 * Exactly three segments, the owner in the middle. That shape is what makes
 * "may this caller delete this object?" answerable from the key alone, with no
 * database lookup and no metadata round trip.
 *
 * TWO WAYS IN.
 *
 *  - uploadPhoto: the bytes arrive at the API (multipart, avatars). The object
 *    is written in the same request as the row that references it, so a failed
 *    write deletes what it just made and nothing is ever left unreferenced.
 *
 *  - createPhotoUpload + verifyUploadedPhoto: the app uploads straight to R2
 *    through a presigned URL (post photos), so the API never holds the bytes -
 *    which is what lets a post carry several photos without buffering them all
 *    in memory. The price is that an upload can be abandoned between the two
 *    steps; post_photos rows track every one, and jobs/photoUploadSweep.js
 *    deletes those never attached to a post. No staging prefix: the object is
 *    written to its final key, and the row is what says it is not in use yet.
 */

const log = createLogger("photos");

// The two key namespaces. Exported so the domain services name the same strings
// this module does, and because parseOwnedKey pins the prefix - which is what
// stops a post delete reaching an avatar object, and the reverse.
export const AVATAR_PREFIX = "avatars";
export const POST_PREFIX = "posts";

const UNSUPPORTED_IMAGE =
  "Image must be a JPEG, PNG or WebP file - the uploaded bytes are none of these";
const STORAGE_UNAVAILABLE = "Photo storage is unavailable, please try again";

// Matches only the filename half of a key. The owner and prefix are compared as
// plain strings by parseOwnedKey, so this pattern never has anything
// caller-controlled interpolated into it - see the note there.
const FILENAME_PATTERN = new RegExp(
  `^[0-9a-f-]{36}\\.(${IMAGE_EXTENSIONS.join("|")})$`,
);

/**
 * Decides whether `key` names an object owned by `ownerId` under `prefix`, and
 * returns it unchanged if so.
 *
 * THE OWNER SEGMENT IS LOAD-BEARING, NOT DECORATION. Both delete paths in this
 * API derive the object to remove from a URL or key that a client could once
 * influence. Without pinning the owner, a caller could name
 * "posts/<somebody-else>/<uuid>.jpg" and have an authorised request perform an
 * unauthorised delete. Pinning the PREFIX matters for the same reason in the
 * other direction: it stops a post delete reaching an avatar object, and vice
 * versa.
 *
 * COMPARED AS STRING SEGMENTS, NEVER AS AN INTERPOLATED REGEX. Building
 * `new RegExp(\`^\${prefix}/\${ownerId}/...\`)` would be safe only for as long as
 * every caller passes a validated uuid; the day one does not, a metacharacter in
 * ownerId silently changes what the pattern means (a "." matching any character)
 * rather than failing. Splitting on "/" has no such failure mode, and is cheaper.
 *
 * Requiring EXACTLY three segments is also what rejects traversal: a key like
 * "posts/<me>/../../avatars/<them>/x.jpg" has more, so it never matches.
 *
 * @param {string} key
 * @param {{ prefix: string, ownerId: string }} owner
 * @returns {string | null} the key, or null when it is not this caller's
 */
export const parseOwnedKey = (key, { prefix, ownerId }) => {
  if (typeof key !== "string" || key.length === 0) return null;

  const segments = key.split("/");
  if (segments.length !== 3) return null;

  const [keyPrefix, keyOwner, filename] = segments;
  if (keyPrefix !== prefix) return null;
  if (keyOwner !== ownerId) return null;
  if (!FILENAME_PATTERN.test(filename)) return null;

  return key;
};

/**
 * The same question as parseOwnedKey, asked of a stored URL rather than a key.
 *
 * The database holds full URLs, so every cleanup path starts here. A URL that is
 * not ours at all - a gravatar, a seeded fixture, one of the placeholder
 * cdn.example.com rows - simply returns null and is left alone. NOTHING outSIDE
 * our own bucket is ever deleted.
 *
 * publicUrlForKey is the exact inverse of the strip below, and both live on the
 * one builder in packages/core/src/storage.js so they cannot disagree about a
 * trailing slash.
 *
 * @param {string | null | undefined} url
 * @param {{ prefix: string, ownerId: string }} owner
 * @returns {string | null}
 */
export const keyFromOwnedUrl = (url, { prefix, ownerId }) => {
  if (typeof url !== "string" || url.length === 0) return null;

  // Compare against a URL built by the same function that produced the stored
  // one, so this cannot drift: whatever publicUrlForKey does to the base, it has
  // already done to both sides.
  const base = publicUrlForKey("");
  if (base === "/") return null; // R2_PUBLIC_URL unset - nothing is ours
  if (!url.startsWith(base)) return null;

  return parseOwnedKey(url.slice(base.length), { prefix, ownerId });
};

/**
 * Best-effort delete. Logs and swallows; never fails the request it belongs to.
 *
 * The same call bumpVersions() makes about Redis in utils/cache.js: a storage
 * hiccup should cost an orphaned object, not turn a successful 200 into a 500
 * that the client retries into a second orphan. The key is in the warning so a
 * leak stays greppable and reclaimable.
 *
 * @param {string | null} key - a key from parseOwnedKey, or null to no-op
 * @param {string} reason
 */
export const deleteQuietly = async (key, reason) => {
  if (!key) return;

  try {
    await deleteFile(key);
  } catch (err) {
    log.warn(`failed to delete ${key} (${reason}): ${err.message}`);
  }
};

/**
 * deleteQuietly for many keys, in as few round trips as possible.
 *
 * deleteFiles RETURNS the keys it could not delete rather than throwing - see
 * its doc block for why a batch delete resolving is not the same as succeeding.
 * Each failure is logged on its own line rather than as a count, because a count
 * is not enough to reclaim anything later.
 *
 * @param {Array<string | null>} keys - nulls are dropped
 * @param {string} reason
 */
export const deleteManyQuietly = async (keys, reason) => {
  const present = keys.filter(Boolean);
  if (present.length === 0) return;

  try {
    const failed = await deleteFiles(present);
    for (const key of failed) {
      log.warn(`failed to delete ${key} (${reason})`);
    }
  } catch (err) {
    log.warn(`batch delete of ${present.length} objects (${reason}): ${err.message}`);
  }
};

/**
 * Stores bytes under a fresh key and returns both halves of the result.
 *
 * The BYTES decide the format, never a Content-Type header. Whatever middleware
 * accepted the request only checked that the declared type was one we allow, and
 * a client controls that completely. detectImageType re-derives the truth, and
 * that is what becomes the stored content type and the file extension - see the
 * doc block in utils/imageType.js for why trusting the header would be stored
 * XSS on a public origin.
 *
 * A FRESH UUID PER UPLOAD rather than one stable key per owner. Overwriting a
 * single key would make orphans impossible, but the URL would never change and
 * every CDN and client cache would keep serving the previous image until it aged
 * out. A new key makes the URL itself the cache buster.
 *
 * @param {{ prefix: string, ownerId: string, buffer: Buffer }} input
 * @returns {Promise<{ key: string, url: string }>}
 * @throws {HttpError} 415 when the bytes are not a supported image, 502 when R2 fails
 */
export const uploadPhoto = async ({ prefix, ownerId, buffer }) => {
  const image = detectImageType(buffer);
  if (!image) throw new HttpError(415, UNSUPPORTED_IMAGE);

  const key = `${prefix}/${ownerId}/${randomUUID()}.${image.ext}`;

  let url;
  try {
    url = await uploadFile({ key, body: buffer, contentType: image.mime });
  } catch (err) {
    // Ours, not the caller's: 502 says "the upstream we depend on did not
    // answer" and tells a client a retry is worth attempting, where the 500 an
    // unhandled throw produces says nothing. The original travels as `cause`,
    // which index.js logs and never serialises.
    log.error(`upload to ${key} failed: ${err.message}`);
    throw new HttpError(502, STORAGE_UNAVAILABLE, { cause: err });
  }

  // Catches a missing or malformed R2_PUBLIC_URL HERE, where the message can say
  // so, rather than letting "undefined/posts/..." reach a NOT NULL column that
  // every client then fails to render. connectR2() warns about this at boot;
  // this is the point where it would actually corrupt a row.
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    await deleteQuietly(key, "unusable public URL");
    log.error(`R2_PUBLIC_URL is missing or malformed - built "${url}"`);
    throw new HttpError(502, STORAGE_UNAVAILABLE);
  }

  return { key, url };
};

/** An object we cannot use as an upload target - the public URL is broken. */
const assertUsableUrl = (url, key) => {
  if (url.startsWith("http://") || url.startsWith("https://")) return;
  log.error(`R2_PUBLIC_URL is missing or malformed - built "${url}" for ${key}`);
  throw new HttpError(502, STORAGE_UNAVAILABLE);
};

/**
 * Reserves a fresh key for one photo and signs a URL the app can PUT it to.
 *
 * The key is final from the start - `<prefix>/<ownerId>/<uuid>.<ext>`, the
 * layout parseOwnedKey enforces - with the extension taken from the DECLARED
 * type. The URL only accepts exactly that type and exactly `sizeBytes` bytes
 * (see createUploadUrl), so the size cap the caller validated is enforced by
 * R2 itself. Nothing has been uploaded yet; verifyUploadedPhoto checks the
 * bytes once they have been.
 *
 * @param {{ prefix: string, ownerId: string, mimeType: string, sizeBytes: number }} input
 * @returns {Promise<{ url: string, uploadUrl: string }>} url is where the photo
 *   will be served from; uploadUrl is the one-off PUT target
 * @throws {HttpError} 415 for a type with no known format, 502 when R2 signing fails
 */
export const createPhotoUpload = async ({ prefix, ownerId, mimeType, sizeBytes }) => {
  const ext = extensionForMime(mimeType);
  if (!ext) throw new HttpError(415, UNSUPPORTED_IMAGE);

  const key = `${prefix}/${ownerId}/${randomUUID()}.${ext}`;
  const url = publicUrlForKey(key);
  assertUsableUrl(url, key);

  try {
    const uploadUrl = await createUploadUrl({
      key,
      contentType: mimeType,
      contentLength: sizeBytes,
      expiresInSec: PHOTO_UPLOAD_URL_TTL_SEC,
    });
    return { url, uploadUrl };
  } catch (err) {
    log.error(`signing an upload for ${key} failed: ${err.message}`);
    throw new HttpError(502, STORAGE_UNAVAILABLE, { cause: err });
  }
};

const isNotFound = (err) =>
  err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey";

/**
 * Checks a presigned upload actually arrived, and is what it claims to be.
 *
 * The API never saw these bytes, so this is where the guarantees uploadPhoto
 * gets from holding them are re-established, by asking R2:
 *
 *  1. It belongs to this owner - keyFromOwnedUrl, the same ownership check
 *     every delete uses.
 *  2. It exists. HEAD; a 404 means the app never finished the PUT.
 *  3. It is within maxBytes. The upload URL already pinned the exact size, so
 *     this is a second line, for a URL signed under an older, looser rule.
 *  4. Its bytes are the image its key and stored Content-Type say. A ranged GET
 *     of the first SNIFF_BYTES, sniffed exactly as uploadPhoto sniffs a whole
 *     upload. This is the stored-XSS guard from utils/imageType.js: without it,
 *     HTML signed as image/jpeg would be served from our public bucket.
 *
 * Returns why it failed rather than throwing, so the caller can delete the bad
 * object and say which photo it was.
 *
 * @param {{ url: string, prefix: string, ownerId: string, maxBytes: number }} input
 * @returns {Promise<string | null>} null when the photo is fine, else the reason
 * @throws {HttpError} 502 when R2 cannot be asked
 */
export const verifyUploadedPhoto = async ({ url, prefix, ownerId, maxBytes }) => {
  const key = keyFromOwnedUrl(url, { prefix, ownerId });
  if (!key) return "is not one of your uploads";

  try {
    const head = await headFile(key);
    if (!head.ContentLength || head.ContentLength > maxBytes) {
      return `is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`;
    }

    const image = detectImageType(await readFileStart(key, SNIFF_BYTES));
    if (!image || !key.endsWith(`.${image.ext}`) || head.ContentType !== image.mime) {
      return "is not a JPEG, PNG or WebP image";
    }

    return null;
  } catch (err) {
    if (isNotFound(err)) return "never finished uploading";
    log.error(`verifying ${key} failed: ${err.message}`);
    throw new HttpError(502, STORAGE_UNAVAILABLE, { cause: err });
  }
};
