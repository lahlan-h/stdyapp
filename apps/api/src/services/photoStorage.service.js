import { randomUUID } from "node:crypto";

import {
  uploadFile,
  copyObject,
  deleteFile,
  deleteFiles,
  publicUrlForKey,
  createLogger,
} from "@stdyapp/core";
import { HttpError } from "../utils/httpError.js";
import { detectImageType, IMAGE_EXTENSIONS } from "../utils/imageType.js";

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
 * STAGING. Post photos land under "tmp/" first and are promoted to "posts/" when
 * the row that references them is written. See promotePhoto for why that is the
 * ordinary path rather than an optimisation.
 */

const log = createLogger("photos");

// Anything not promoted from here is unreferenced by definition, which is what
// lets a bucket lifecycle rule expire the prefix wholesale. Exported so the
// domain services name the same string this module does.
export const TMP_PREFIX = "tmp";
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

/**
 * Moves an object from the staging prefix to its permanent one.
 *
 * WHY STAGING EXISTS. A two-step upload - bytes in one request, the row that
 * references them in another - can always be abandoned between the two, and the
 * abandoned object is unreferenced forever. For avatars that is bounded at about
 * one object per user, because every upload deletes the previous one. For posts
 * NOTHING deletes it, so an account uploading at its rate limit and never
 * posting writes tens of gigabytes a day that nothing reclaims. That is a
 * billing problem, not an acceptable tradeoff.
 *
 * Uploading to "tmp/" first turns it into a solved problem with no sweeper, no
 * worker and no new dependency: one bucket lifecycle rule expiring that prefix
 * after a day reclaims everything that was never promoted. Objects under
 * "posts/" are exactly the referenced ones.
 *
 * It also pays for itself twice more. A copy FAILS when the source is gone, so
 * "was this ever uploaded?" is answered as a side effect rather than by a
 * separate HeadObject - the same number of round trips as checking explicitly.
 * And a key replayed for a second row finds its source already deleted by the
 * first, which kills the realistic double-use case for free.
 *
 * THIS COPIES AND NOTHING ELSE. Removing the staged source is the CALLER's job,
 * and only once the row referencing the copy has actually been written - the
 * same rule avatar.service.js follows for the object it replaces, and for the
 * same reason: until that write lands, the old object is still the only good
 * one. Deleting the source here instead would consume the key on the way to a
 * database error, so a client retrying a perfectly retryable 500 would find its
 * upload gone and have to send the whole file again.
 *
 * That ordering is also what preserves single-use. The source survives a failed
 * create (so the key still works) and is deleted after a successful one (so the
 * key stops working) - which is exactly the property wanted in both directions.
 *
 * @param {{ key: string, toPrefix: string }} input - key must be under TMP_PREFIX
 * @returns {Promise<{ key: string, url: string }>} the permanent key and URL
 * @throws {HttpError} 400 when the staged object is gone, 502 when R2 fails
 */
export const promotePhoto = async ({ key, toPrefix }) => {
  // Only the prefix changes: the owner and filename carry over, so the promoted
  // key is still parseOwnedKey-able by the same owner.
  const target = key.replace(new RegExp(`^${TMP_PREFIX}/`), `${toPrefix}/`);

  try {
    await copyObject({ from: key, to: target });
  } catch (err) {
    if (err.code === "NoSuchKey") {
      throw new HttpError(
        400,
        "photoKey does not name an uploaded image - upload it first, and note that a key can only be used once",
        { cause: err },
      );
    }

    log.error(`promote ${key} -> ${target} failed: ${err.message}`);
    throw new HttpError(502, STORAGE_UNAVAILABLE, { cause: err });
  }

  return { key: target, url: publicUrlForKey(target) };
};
