import {
  AVATAR_PREFIX,
  uploadPhoto,
  keyFromOwnedUrl,
  deleteQuietly,
} from "./photoStorage.service.js";
import { getUserById, updateUser } from "./user.service.js";

/**
 * Avatar photos: the user-domain half of the upload story.
 *
 * The object-storage half - key layout, magic-byte sniffing, the ownership rule
 * that decides which objects this API may delete - lives in
 * photoStorage.service.js, which posts share. What stays here is everything that
 * is about USERS: the 404, the column, and the cache fan-out.
 *
 * This layer does NOT touch Prisma: user.service.js documents itself as "the
 * ONLY module in apps/api that touches prisma.user", and that stays true. Every
 * database write below goes through updateUser().
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
 *
 * NO STAGING PREFIX HERE, unlike posts. An avatar is uploaded and referenced
 * within one request, so there is no window in which an object can be abandoned,
 * and every upload deletes the previous one - a user's footprint is bounded at
 * about one object no matter how many times they change their picture. Posts get
 * neither guarantee, which is why promotePhoto exists for them and not here.
 */

// The owner that every key on this path belongs to. Passed to photoStorage on
// each call rather than baked in there, because that module serves two domains.
const owner = (userId) => ({ prefix: AVATAR_PREFIX, ownerId: userId });

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

  const { key, url } = await uploadPhoto({
    prefix: AVATAR_PREFIX,
    ownerId: userId,
    buffer,
  });

  let user;
  try {
    // Runs invalidateUserFanout internally - see the note at the top of this
    // file for why that matters more here than anywhere else in the API.
    user = await updateUser(userId, { avatarUrl: url });
  } catch (err) {
    // The row still points at the OLD object, so the one just uploaded is now
    // unreferenced. Drop it rather than leaking one on every failed write.
    //
    // Safe to delete here, unlike the post path: this request uploaded it a
    // moment ago and no client holds a reference to retry with.
    await deleteQuietly(key, "database write failed");
    throw err;
  }

  // Only NOW is the old object unreferenced. Doing this before the write would
  // break a live avatar if the write then failed.
  await deleteQuietly(
    keyFromOwnedUrl(before.avatarUrl, owner(userId)),
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
  const key = keyFromOwnedUrl(before.avatarUrl, owner(userId));
  const user = await updateUser(userId, { avatarUrl: null });

  await deleteQuietly(key, "avatar removed");

  return user;
};
