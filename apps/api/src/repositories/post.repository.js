import { prisma } from "@stdyapp/core";

export const createPost = ({ userId, sessionId, routineId, caption, photoUrl }) => {
  return prisma.post.create({
    data: { userId, sessionId, routineId, caption, photoUrl },
  });
};

export const findPostById = (id) => {
  return prisma.post.findUnique({ where: { id } });
};

// Newest first, matching findSessionsByUser — a feed reads backwards in time.
// Served straight out of the @@index([userId, createdAt]) on posts.
export const findPostsByUser = (userId) => {
  return prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * One page of the GLOBAL feed, newest first, with the totals a pager needs.
 *
 * Served by @@index([createdAt]) on posts. The per-user composite index cannot
 * help here: createdAt is its second column, so without an equality predicate
 * on the leading userId there is no usable ordering.
 *
 * The `id` tiebreaker is load-bearing, not decoration. createdAt is not unique,
 * so two posts sharing a timestamp have no defined relative order, and under
 * OFFSET pagination that is a correctness bug rather than an aesthetic one: the
 * planner may break the tie differently between two requests, and the row then
 * appears on both page 1 and page 2, or on neither.
 *
 * The findMany and the count run in one transaction so the page and its total
 * are read from the same snapshot — otherwise a post inserted between the two
 * queries makes totalPages disagree with the page just returned.
 *
 * The user select is the allowlist already used by findLikesByPost and
 * listMembers. It is what keeps passwordHash and email out of a public feed, so
 * it must stay a select rather than becoming `user: true`.
 *
 * @returns {Promise<[object[], number]>} the page, and the total row count
 */
export const findAllPosts = ({ skip, take }) => {
  return prisma.$transaction([
    prisma.post.findMany({
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.post.count(),
  ]);
};

export const updatePost = (id, data) => {
  return prisma.post.update({ where: { id }, data });
};

export const deletePost = (id) => {
  return prisma.post.delete({ where: { id } });
};

// deleteMany returns { count } rather than the deleted rows — the tally is all
// a bulk delete needs, and not materialising N records keeps a heavy account
// cleanup cheap. Unlike delete(), it does not throw when nothing matches, which
// is what makes "delete all my posts" naturally idempotent.
export const deletePostsByUser = (userId) => {
  return prisma.post.deleteMany({ where: { userId } });
};
