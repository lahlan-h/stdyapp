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

export const deleteLikesByUser = (userId) => {
  return prisma.like.deleteMany({ where: { userId } });
};
