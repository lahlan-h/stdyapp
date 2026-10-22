import { prisma } from "@stdyapp/core";

/**
 * post_photos: one row per photo, attached to a post or waiting to be.
 *
 * See the PostPhoto model in schema.prisma for the lifecycle. Every write here
 * takes explicit fields rather than a `data` object, the rule
 * subscription.repository.js states: nothing request-shaped reaches a row.
 */

/**
 * Records uploads the app is about to make, unattached, in the order given.
 *
 * @param {Array<{ userId: string, url: string, width?: number, height?: number }>} photos
 * @returns {Promise<Array<{ id: string, url: string }>>}
 */
export const createPendingPhotos = (photos) =>
  prisma.postPhoto.createManyAndReturn({
    data: photos.map(({ userId, url, width, height }) => ({
      userId,
      url,
      width: width ?? null,
      height: height ?? null,
    })),
    select: { id: true, url: true },
  });

/**
 * This user's uploads among `ids` that are not on a post yet - the only ones a
 * new post may claim. Anything else (someone else's, already used, swept) is
 * simply missing from the result, and the caller refuses the post.
 *
 * @param {{ ids: string[], userId: string }} query
 */
export const findUnattachedPhotos = ({ ids, userId }) =>
  prisma.postPhoto.findMany({
    where: { id: { in: ids }, userId, postId: null },
    select: { id: true, url: true },
  });

/**
 * Uploads left unattached since before `before` - abandoned between picking a
 * photo and posting it. Bounded, so one sweep of a large backlog cannot hold
 * a huge result in memory; the next sweep takes the rest.
 *
 * @param {Date} before
 * @param {number} take
 */
export const findAbandonedPhotos = (before, take) =>
  prisma.postPhoto.findMany({
    where: { postId: null, createdAt: { lt: before } },
    select: { id: true, userId: true, url: true },
    orderBy: { createdAt: "asc" },
    take,
  });

/**
 * Deletes uploads by id - but only while they are STILL unattached, so a sweep
 * that read a row a moment before a post claimed it cannot delete a live photo.
 *
 * ONE statement, DELETE ... RETURNING, and that is the point: the ids it
 * returns are exactly the rows it removed, so the caller deletes R2 objects for
 * those and no others. A find-then-delete pair would report a row claimed in
 * between as deleted, and the sweep would then remove a live post's image.
 *
 * @param {string[]} ids
 * @returns {Promise<string[]>} the ids actually deleted
 */
export const deleteUnattachedPhotos = async (ids) => {
  if (ids.length === 0) return [];
  const rows = await prisma.$queryRaw`
    DELETE FROM post_photos
    WHERE id = ANY(${ids}::text[]) AND "postId" IS NULL
    RETURNING id
  `;
  return rows.map(({ id }) => id);
};

/**
 * The photos on one post, or on every post by one user - read BEFORE deleting
 * those posts, since the rows cascade away with them and the R2 objects do not.
 *
 * @param {{ postId?: string, authorId?: string }} scope
 * @returns {Promise<Array<{ userId: string, url: string }>>}
 */
export const findPhotosOfPosts = ({ postId, authorId }) =>
  prisma.postPhoto.findMany({
    where: postId ? { postId } : { post: { userId: authorId } },
    select: { userId: true, url: true },
  });

/**
 * EVERY photo one user has uploaded - on a post or still waiting for one.
 *
 * For account deletion, where findPhotosOfPosts is not enough: an upload not yet
 * on a post has no post to be found through, its row cascades away with the
 * user, and the sweep works from rows - so its object would never be reclaimed.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ userId: string, url: string }>>}
 */
export const findPhotosByUploader = (userId) =>
  prisma.postPhoto.findMany({
    where: { userId },
    select: { userId: true, url: true },
  });
