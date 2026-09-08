import { prisma } from "@stdyapp/core";

/**
 * Every read in this file is scoped to ONE user, and that is the privacy model
 * rather than a coincidence of the routes that exist today.
 *
 * Note the absence of a findBookmarksByPost twin. Every other repository here has
 * one — findLikesByPost, findCommentsByPost — because those lists are public. The
 * missing function IS the feature: "who saved this post" is the exact fact this
 * entity withholds. See the authorisation note in bookmark.service.js.
 */

export const createBookmark = ({ userId, postId }) => {
  return prisma.bookmark.create({ data: { userId, postId } });
};

// The compound-unique lookup, the same shape as findLikeByUserAndPost and
// findBlock. bookmarks has no natural single-column key other than its id, and no
// caller ever knows that id: a client holds a postId and its own token, which is
// exactly this pair.
export const findBookmarkByUserAndPost = (userId, postId) => {
  return prisma.bookmark.findUnique({
    where: { userId_postId: { userId, postId } },
  });
};

/**
 * The caller's saved list — newest first, and the ONLY unpaginated read of this
 * table any route exposes.
 *
 * Ordered by savedAt, where findLikesByUser has to fall back to the LIKED POST's
 * createdAt and findBlocksByBlocker to a username. Those two carry comments
 * explaining that the entity has no chronological key of its own; this one does,
 * which is the whole reason savedAt exists. The order is also the point of the
 * feature — a saved list is a stack, most recent at the top.
 *
 * Served end to end by @@index([userId, savedAt]), so Postgres satisfies both the
 * filter and the sort from one index rather than sorting the matched rows.
 *
 * The post is included because a bare list of {id, userId, postId, savedAt} is
 * useless to a client rendering "saved posts" — it would have to re-fetch each
 * one. It is the BARE Post row, exactly as findLikesByUser returns: no author
 * join, which is what keeps a renamed user from going stale in anyone's saved
 * list. See the bookmark block in utils/cache.js.
 */
export const findBookmarksByUser = (userId) => {
  return prisma.bookmark.findMany({
    where: { userId },
    include: { post: true },
    orderBy: { savedAt: "desc" },
  });
};

/**
 * One page of the caller's OWN bookmarks, with the totals a pager needs.
 *
 * NOTE the where clause on BOTH halves. This backs GET /api/bookmarks/all, and
 * that path means something different here from most routers: there it is every
 * row in the system, here it is the caller's own rows only — the call
 * findBlocksPageByBlocker makes, for the same privacy reason. If the filter ever
 * disappears from either half, that is the bug.
 *
 * The findMany and the count run in one transaction so the page and its total are
 * read from the same snapshot.
 *
 * The id tiebreaker is required for the reason findAllPosts and findAllLikes
 * give: savedAt is not unique — a client that saves two posts in the same
 * millisecond produces a tie — and an unstable tie duplicates or skips rows
 * across page boundaries.
 *
 * @returns {Promise<[object[], number]>} the page, and the caller's total
 */
export const findBookmarksPageByUser = ({ userId, skip, take }) => {
  return prisma.$transaction([
    prisma.bookmark.findMany({
      where: { userId },
      include: { post: true },
      orderBy: [{ savedAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.bookmark.count({ where: { userId } }),
  ]);
};

/**
 * NOTHING IN THIS FILE UPDATES A ROW, and that is the shape of the entity rather
 * than a gap. A bookmark is a toggle: it exists or it does not. Every column is
 * the primary key, half the row's identity, or a timestamp the server stamps
 * once — so there is no edit to make, only a create and a delete. See the note
 * at the foot of bookmark.routes.js.
 */

// deleteMany rather than delete, for the same reason deleteLikeByUserAndPost uses
// it: it does not throw when nothing matches. That is what makes unsave a safe
// toggle — a client that taps twice, or retries after a dropped response, gets
// the same 204 instead of a P2025 the error middleware would turn into a 500.
export const deleteBookmarkByUserAndPost = (userId, postId) => {
  return prisma.bookmark.deleteMany({ where: { userId, postId } });
};

/**
 * "Clear my saved posts".
 *
 * Scoped on userId ONLY. There is no postId-scoped bulk delete and there must not
 * be one: it would let a post's author clear their post out of everyone else's
 * saved list, which is the single worst write this table could offer.
 */
export const deleteBookmarksByUser = (userId) => {
  return prisma.bookmark.deleteMany({ where: { userId } });
};

/**
 * Everyone who has saved any of these posts — for cache invalidation, not for
 * reading.
 *
 * The mirror of findLikerIdsByPosts, and used the same way: invalidatePostFanout
 * in post.service.js calls it because a saved list embeds whole Post rows, so an
 * edited caption or a deleted post leaves that list stale for everyone who saved
 * it — and no bookmark was written, so nothing in bookmark.service.js bumps.
 *
 * Takes the whole id array rather than running per-post, so clearing an account
 * with a hundred posts costs one query rather than a hundred.
 *
 * Selects the single column invalidation needs rather than whole rows, so a post
 * saved by thousands does not materialise thousands of records to compute a
 * handful of cache keys. Served by @@index([postId]) — the index that exists for
 * this caller and for Postgres's own cascade, and for no route. No distinct and
 * no orderBy: bumpVersions de-duplicates via a Set already, and order is
 * meaningless to a set of keys.
 *
 * ⚠ This returns the ids of people who saved a post, which is precisely the fact
 * the API withholds. It is for bumping counters and nothing else — no route may
 * return this, or anything derived from it, to a caller.
 *
 * @param {string[]} postIds
 * @returns {Promise<Array<{ userId: string }>>}
 */
export const findBookmarkerIdsByPosts = (postIds) => {
  return prisma.bookmark.findMany({
    where: { postId: { in: postIds } },
    select: { userId: true },
  });
};

/**
 * There is deliberately NO findBookmarkTargetsByUser here, where likes have one.
 *
 * findLikeTargetsByUser exists because clearing a user's likes must bump a
 * counter per POST touched — likes have a public per-post surface. Bookmarks have
 * a single one-ended counter (see the bookmark block in utils/cache.js), so the
 * bulk delete bumps exactly one key and has nothing to read beforehand. The
 * absence looks like an oversight next to like.repository.js; it is not.
 */
