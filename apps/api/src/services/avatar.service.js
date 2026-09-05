import { randomUUID } from "node:crypto";

import { uploadFile, deleteFile, createLogger } from "@stdyapp/core";
import { HttpError } from "../utils/httpError.js";
import { detectImageType, IMAGE_EXTENSIONS } from "../utils/imageType.js";
import { avatarUrlSchema } from "../validation/user.validation.js";
import { getUserById, updateUser } from "./user.service.js";

/**
 * Avatar photos: the first consumer of the R2 client in @stdyapp/core.
 *
 * This layer owns STORAGE POLICY - what an object is called, which bytes are
 * acceptable, and which objects this API is entitled to delete. It deliberately
 * does NOT touch Prisma: user.service.js documents itself as "the ONLY module in
 * apps/api that touches prisma.user", and that stays true here. Every database
 * write below goes through updateUser().
 *
 * Going through updateUser() rather than writing avatarUrl directly is the whole
 * reason this file is shaped the way it is. updateUser() runs
 * invalidateUserFanout(), which bumps not just the profile key but
 * postVersionKey for every post the user has COMMENTED on and likePostVersionKey
 * for every post they have LIKED - because those cached payloads embed
 * avatarUrl. A hand-rolled prisma.user.update() here would return a correct 200
 * and leave the old picture in every comment thread in the app for the full TTL.
 *
 * ORDER OF OPERATIONS matters in both directions, and is the same in both
 * exported functions:
 *
 *   upload the new object  ->  write the row  ->  delete the old object
 *
 * Uploading first means the row never points at an object that does not exist.
 * Deleting last means the old object survives until the row has stopped
 * referencing it, so a failed write leaves the existing avatar intact rather
 * than broken. The cost of being wrong in this direction is an orphaned object;
 * the cost of the other is a visibly broken profile.
 */

const log = createLogger("avatar");

// Every object this service creates lives under this prefix. It is also half of
// the ownership check below, so it is a constant rather than an inline string.
const AVATAR_PREFIX = "avatars";

const STORAGE_UNAVAILABLE = "Avatar storage is unavailable, please try again";
const UNSUPPORTED_IMAGE =
  "Image must be a JPEG, PNG or WebP file - the uploaded bytes are none of these";

/**
 * Matches ONLY the keys setAvatar() generates, for one specific user.
 *
 * The uuid group is deliberately loose rather than a strict uuid grammar: it is
 * filtering our own randomUUID() output, not validating input, and being
 * marginally permissive there cannot let a key through that fails the prefix and
 * userId checks around it.
 *
 * The extension list is derived from imageType.js rather than written out a
 * second time, so adding a format there cannot leave this refusing to recognise
 * - and therefore refusing to clean up - keys the upload path has just created.
 *
 * @param {string} userId
 * @returns {RegExp}
 */
const ownedKeyPattern = (userId) =>
  new RegExp(
    `^${AVATAR_PREFIX}/${userId}/[0-9a-f-]{36}\\.(${IMAGE_EXTENSIONS.join("|")})$`,
  );

/**
 * Recovers the R2 object key from a stored avatarUrl, but ONLY when that URL
 * names an object this user owns. Returns null for anything else.
 *
 * THE userId IN THE PATTERN IS LOAD-BEARING, NOT DECORATION. Before this change
 * avatarUrl was client-settable through PATCH /api/users/:id, so a caller could
 * point their own avatarUrl at R2_PUBLIC_URL + "/posts/<someone-elses>.jpg" and
 * then call DELETE /api/users/:id/photo to destroy another user's object - an
 * authorised request performing an unauthorised delete. avatarUrl has since been
 * removed from that schema, which closes it at the source; this closes it again
 * at the point of use, which is the layer that would actually issue the DELETE.
 *
 * It also handles the ordinary case of a row holding a genuine third-party URL
 * (a gravatar, a seeded dev fixture): not ours, so null, so left alone. Nothing
 * outside our own bucket is ever deleted.
 *
 * process.env is read PER CALL, never at module scope - the rule stated at the
 * top of packages/core/src/storage.js. A module-scope read here would be
 * evaluated before config/env.js has loaded the root .env and would capture
 * undefined forever.
 *
 * @param {string | null | undefined} url - the currently stored avatarUrl
 * @param {string} userId - the owner the key must belong to
 * @returns {string | null} the object key, or null when it is not this user's
 */
export const keyFromOwnAvatarUrl = (url, userId) => {
  if (typeof url !== "string" || url.length === 0) return null;

  // uploadFile() builds `${R2_PUBLIC_URL}/${key}`, so a configured trailing
  // slash produces a double slash in the stored URL. Strip it from both sides
  // rather than requiring the deployment to be punctuated a particular way.
  const prefix = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (prefix.length === 0) return null;
  if (!url.startsWith(`${prefix}/`)) return null;

  const key = url.slice(prefix.length).replace(/^\/+/, "");

  return ownedKeyPattern(userId).test(key) ? key : null;
};

/**
 * Deletes an object without letting a storage failure fail the request.
 *
 * Best-effort by design, the same call bumpVersions() makes in utils/cache.js: a
 * Redis outage there costs a stale cache entry rather than turning a successful
 * 200 into a 500, and an R2 hiccup here costs an orphaned object rather than a
 * failed avatar change that the user then retries into a second orphan. The
 * warning carries the key, so a leak is greppable and reclaimable later.
 *
 * @param {string | null} key - a key from keyFromOwnAvatarUrl, or null to no-op
 * @param {string} reason - what this cleanup was for, for the log line
 * @returns {Promise<void>}
 */
const deleteQuietly = async (key, reason) => {
  if (!key) return;

  try {
    await deleteFile(key);
  } catch (err) {
    log.warn(`failed to delete ${key} (${reason}): ${err.message}`);
  }
};

/**
 * Uploads bytes to R2 and returns their public URL.
 *
 * The SDK failures here are network and credential problems on OUR side, not the
 * caller's, so they become a 502 rather than the 500 an unhandled throw would
 * produce - "the upstream we depend on did not answer" is exactly what 502
 * means, and it tells a client that a retry is worth attempting. The original
 * error travels as `cause`, which index.js logs and never serialises.
 *
 * @param {{ key: string, body: Buffer, contentType: string }} object
 * @returns {Promise<string>} the public URL
 */
const putObject = async ({ key, body, contentType }) => {
  try {
    return await uploadFile({ key, body, contentType });
  } catch (err) {
    log.error(`upload to ${key} failed: ${err.message}`);
    throw new HttpError(502, STORAGE_UNAVAILABLE, { cause: err });
  }
};

/**
 * Sets or replaces a user's avatar.
 *
 * @param {string} userId - already proven to be the caller's own by requireSelf
 * @param {Buffer} buffer - the complete uploaded body, size-capped by rawImage()
 * @returns {Promise<object>} the updated user, without passwordHash
 * @throws {HttpError} 404 unknown user, 415 unrecognised bytes, 502 R2 down
 */
export const setAvatar = async (userId, buffer) => {
  // FIRST, before spending a round trip on R2: raises the 404 for a user who
  // does not exist, and gives us the previous URL to clean up at the end.
  const before = await getUserById(userId);

  // The BYTES decide, never the Content-Type header - rawImage() only checked
  // that the header was one we accept, and a client controls that completely.
  // See the doc block in utils/imageType.js for why storing a client-declared
  // content type on a public origin is stored XSS.
  const image = detectImageType(buffer);
  if (!image) throw new HttpError(415, UNSUPPORTED_IMAGE);

  // A fresh uuid per upload rather than one stable key per user. Overwriting a
  // single key would make orphans impossible, but the URL would never change and
  // every CDN and client cache would keep serving the previous picture until it
  // aged out. A new key makes the URL itself the cache buster.
  const key = `${AVATAR_PREFIX}/${userId}/${randomUUID()}.${image.ext}`;

  const avatarUrl = await putObject({
    key,
    body: buffer,
    contentType: image.mime,
  });

  // Catches a missing or malformed R2_PUBLIC_URL HERE, where the message can say
  // so, rather than storing "undefined/avatars/..." and leaving every client to
  // fail at rendering it. connectR2() already warns about this at boot; this is
  // the point where it would actually corrupt a row.
  if (!avatarUrlSchema.safeParse(avatarUrl).success) {
    await deleteQuietly(key, "unusable public URL");
    log.error(`R2_PUBLIC_URL is missing or malformed - built "${avatarUrl}"`);
    throw new HttpError(502, STORAGE_UNAVAILABLE);
  }

  let user;
  try {
    // Runs invalidateUserFanout internally - see the note at the top of this
    // file for why that matters more here than anywhere else in the API.
    user = await updateUser(userId, { avatarUrl });
  } catch (err) {
    // The row still points at the OLD object, so the one just uploaded is now
    // unreferenced. Drop it rather than leaking one on every failed write.
    await deleteQuietly(key, "database write failed");
    throw err;
  }

  // Only NOW is the old object unreferenced. Doing this before the write would
  // break a live avatar if the write then failed.
  await deleteQuietly(
    keyFromOwnAvatarUrl(before.avatarUrl, userId),
    "replaced by a new avatar",
  );

  return user;
};

/**
 * Removes a user's avatar.
 *
 * IDEMPOTENT: removing an absent avatar is a 200 with avatarUrl already null,
 * not a 404. DELETE is defined to be idempotent, and a double-tap on a "remove
 * photo" button should not produce an error - the desired end state was reached
 * either way. That case short-circuits entirely, so it costs no database write
 * and no cache fan-out.
 *
 * @param {string} userId - already proven to be the caller's own by requireSelf
 * @returns {Promise<object>} the updated user, without passwordHash
 * @throws {HttpError} 404 when no such user exists
 */
export const removeAvatar = async (userId) => {
  const before = await getUserById(userId);

  if (before.avatarUrl == null) return before;

  // Resolved BEFORE the write, while the URL is still readable. buildUserData in
  // user.service.js copies avatarUrl on "!== undefined", so null passes straight
  // through to Prisma and clears the column. Note that updateUserSchema could not
  // express this, which is fine - it is not a client-reachable shape.
  const key = keyFromOwnAvatarUrl(before.avatarUrl, userId);
  const user = await updateUser(userId, { avatarUrl: null });

  await deleteQuietly(key, "avatar removed");

  return user;
};
