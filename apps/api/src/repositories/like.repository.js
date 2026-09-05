import { prisma } from "@stdyapp/core";

export const createLike = ({ userId, postId }) => {
  return prisma.like.create({ data: { userId, postId } });
};

// The compound-unique lookup, same shape as findMembership — likes has no
// natural single-column key other than its id, and no caller ever knows that
// id: a client holds a postId and its own token, which is exactly this pair.
export const findLikeByUserAndPost = (userId, postId) => {
  return prisma.like.findUnique({
    where: { userId_postId: { userId, postId } },
  });
};

/**
 * The "liked by" list for one post.
 *
 * Ordered by the liker's username, copying listMembers. This is the one real
 * cost of Like having no createdAt: there is no chronological key to sort by,
 * and WITHOUT an orderBy Postgres returns whatever the plan yields — which
 * changes once the table grows and the planner switches from a sequential scan
 * to an index scan, quietly breaking any pagination built on top.
 *
 * Alphabetical is arbitrary but deterministic, and at least defensible to a
 * human reading the list. A chronological "recent likers" list is impossible
 * until a createdAt column is added.
 */
export const findLikesByPost = (postId) => {
  return prisma.like.findMany({
    where: { postId },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    orderBy: { user: { username: "asc" } },
  });
};

// The post is included because a bare list of {id, userId, postId} is useless
// to a client rendering "posts you liked" — it would have to re-fetch each one.
export const findLikesByUser = (userId) => {
  return prisma.like.findMany({
    where: { userId },
    include: { post: true },
    orderBy: { post: { createdAt: "desc" } },
  });
};

/**
 * One page of EVERY like, with the totals a pager needs.
 *
 * Ordered by the liked post's date because Like has no createdAt of its own —
 * the deliberate omission documented on the model. That means this sort runs on
 * a JOINED column and can be served by no index on likes, so each page sorts
 * the whole join. Fine at current volumes, and the first thing to change if
 * this route gets slow; the real fix is a createdAt column on Like, which is
 * the debt already recorded on findLikesByPost above.
 *
 * Ordering by id alone would be indexable and stable, but a list ordered by
 * random uuid is not browsable by a human, which is the point of the route.
 *
 * The id tiebreaker is required for the same reason as in findAllPosts: post
 * timestamps are not unique, and an unstable tie duplicates or skips rows
 * across page boundaries.
 *
 * @returns {Promise<[object[], number]>} the page, and the total row count
 */
export const findAllLikes = ({ skip, take }) => {
  return prisma.$transaction([
    prisma.like.findMany({
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        post: true,
      },
      orderBy: [{ post: { createdAt: "desc" } }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.like.count(),
  ]);
};

export const countLikesByPost = (postId) => {
  return prisma.like.count({ where: { postId } });
};

// deleteMany rather than delete, for the same reason deletePostsByUser uses it:
// it does not throw when nothing matches. That is what makes unlike a safe
// toggle — a client that taps twice, or retries after a dropped response, gets
// the same 204 instead of a P2025 the error middleware would turn into a 500.
export const deleteLikeByUserAndPost = (userId, postId) => {
  return prisma.like.deleteMany({ where: { userId, postId } });
};

/**
 * The posts one user has liked — for cache invalidation, not for reading.
 *
 * Must be read BEFORE deleteLikesByUser runs: afterwards the rows are gone and
 * there is nothing left to work out which posts' like counts just went stale.
 * The twin of findCommentTargetsByUser.
 *
 * Selects the single column invalidation needs rather than whole rows, so a user
 * with thousands of likes does not materialise thousands of records to compute a
 * handful of cache keys. No distinct and no orderBy: bumpVersions de-duplicates
 * via a Set already, and order is meaningless to a set of keys.
 *
 * @returns {Promise<Array<{ postId: string }>>}
 */
export const findLikeTargetsByUser = (userId) => {
  return prisma.like.findMany({
    where: { userId },
    select: { postId: true },
  });
};

export const deleteLikesByUser = (userId) => {
  return prisma.like.deleteMany({ where: { userId } });
};
