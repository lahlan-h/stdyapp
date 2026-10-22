import { createLogger } from "@stdyapp/core";

import * as postPhotoRepo from "../repositories/postPhoto.repository.js";
import {
  POST_PREFIX,
  createPhotoUpload,
  keyFromOwnedUrl,
  deleteManyQuietly,
} from "./photoStorage.service.js";
import { PHOTO_UPLOAD_TTL_MS } from "../config/upload.js";

const log = createLogger("photo-uploads");

/**
 * Post photos uploaded straight to R2 - step one of creating a post with photos.
 *
 *   1. POST /api/posts/photos     createPhotoUploads: a row and a presigned
 *                                 PUT URL per photo
 *   2. PUT <uploadUrl>            the app, directly to R2
 *   3. POST /api/posts            createPost in post.service.js: verifies what
 *                                 arrived and attaches it
 *
 * Anything that stops between 1 and 3 is collected by sweepAbandonedPhotoUploads.
 */

/**
 * Reserves an upload for each photo the app is about to send.
 *
 * The rows are written AFTER every URL is signed, so a signing failure part way
 * leaves nothing behind - signing touches no storage, and no row means nothing
 * for the sweep to find.
 *
 * @param {string} userId
 * @param {Array<{ mimeType: string, sizeBytes: number, width?: number,
 *                 height?: number }>} photos - validated by
 *   createPhotoUploadsSchema, in display order
 * @returns {Promise<Array<{ photoId: string, uploadUrl: string, contentType: string }>>}
 *   in the same order; the PUT must send exactly contentType, and exactly
 *   sizeBytes bytes
 */
export const createPhotoUploads = async (userId, photos) => {
  const signed = await Promise.all(
    photos.map((photo) =>
      createPhotoUpload({
        prefix: POST_PREFIX,
        ownerId: userId,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
      }),
    ),
  );

  const rows = await postPhotoRepo.createPendingPhotos(
    photos.map((photo, index) => ({
      userId,
      url: signed[index].url,
      width: photo.width,
      height: photo.height,
    })),
  );

  // createManyAndReturn keeps input order, but match on url rather than rely on
  // it: a wrong pairing would hand one photo's upload URL another's id.
  const idByUrl = new Map(rows.map((row) => [row.url, row.id]));
  return photos.map((photo, index) => ({
    photoId: idByUrl.get(signed[index].url),
    uploadUrl: signed[index].uploadUrl,
    contentType: photo.mimeType,
  }));
};

/** Rows per sweep - see findAbandonedPhotos. The next sweep takes the rest. */
const SWEEP_BATCH = 500;

/**
 * Deletes uploads that were never attached to a post: the app closed, or the
 * post was abandoned, between picking photos and posting them.
 *
 * Older than PHOTO_UPLOAD_TTL_MS only, so someone still writing their caption
 * never loses a photo. Rows go first, through the conditional delete that only
 * removes ones STILL unattached, and only the objects of rows it actually
 * removed are deleted - so a post that claims a photo mid-sweep keeps it.
 *
 * Objects for uploads that were signed but never PUT simply do not exist; the
 * batch delete treats a missing key as done.
 *
 * @param {Date} [now]
 * @returns {Promise<number>} how many uploads were removed
 */
export const sweepAbandonedPhotoUploads = async (now = new Date()) => {
  const before = new Date(now.getTime() - PHOTO_UPLOAD_TTL_MS);
  const abandoned = await postPhotoRepo.findAbandonedPhotos(before, SWEEP_BATCH);
  if (abandoned.length === 0) return 0;

  const deletedIds = new Set(
    await postPhotoRepo.deleteUnattachedPhotos(abandoned.map(({ id }) => id)),
  );

  await deleteManyQuietly(
    abandoned
      .filter(({ id }) => deletedIds.has(id))
      .map(({ url, userId }) => keyFromOwnedUrl(url, { prefix: POST_PREFIX, ownerId: userId })),
    "abandoned upload",
  );

  if (deletedIds.size < abandoned.length) {
    log.info(`${abandoned.length - deletedIds.size} upload(s) were attached mid-sweep and kept`);
  }

  return deletedIds.size;
};
