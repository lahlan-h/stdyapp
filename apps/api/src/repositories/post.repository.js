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

/**
 * The ids of one user's posts, for cache invalidation.
 *
 * Must be read BEFORE deletePostsByUser runs: afterwards the rows are gone and
 * there is nothing left to work out which caches went stale. The same ordering
 * requirement findCommentTargetsByUser and findLikeTargetsByUser document.
 *
 * Selects the one column invalidation needs rather than reusing
 * findPostsByUser, so clearing a heavy account does not materialise every
 * caption and photo URL to compute a list of cache keys.
 *
 * @returns {Promise<Array<{ id: string }>>}
 */
export const findPostIdsByUser = (userId) => {
  return prisma.post.findMany({ where: { userId }, select: { id: true } });
};

/**
 * The posts pointing at a session (or a routine), with their authors.
 *
 * Exists for cache invalidation on a path that has NO post write in it.
 * sessions.id and study_routines.id are ON DELETE SET NULL from posts, so
 * deleting either rewrites posts.sessionId / posts.routineId inside Postgres
 * without anything passing through post.service.js — and a cached post would
 * otherwise keep showing a link to a row that no longer exists, for the whole
 * TTL, with no log line.
 *
 * Must be read BEFORE the delete: afterwards the FK is already NULL and there
 * is no way left to find which posts were touched.
 *
 * Returns userId as well as id because both the per-post cache and the author's
 * list cache go stale, and this is the only chance to learn the author.
 *
 * @returns {Promise<Array<{ id: string, userId: string }>>}
 */
export const findPostRefsBySession = (sessionId) => {
  return prisma.post.findMany({ where: { sessionId }, select: { id: true, userId: true } });
};

/** @see findPostRefsBySession */
export const findPostRefsByRoutine = (routineId) => {
  return prisma.post.findMany({ where: { routineId }, select: { id: true, userId: true } });
};

// deleteMany returns { count } rather than the deleted rows — the tally is all
// a bulk delete needs, and not materialising N records keeps a heavy account
// cleanup cheap. Unlike delete(), it does not throw when nothing matches, which
// is what makes "delete all my posts" naturally idempotent.
export const deletePostsByUser = (userId) => {
  return prisma.post.deleteMany({ where: { userId } });
};
