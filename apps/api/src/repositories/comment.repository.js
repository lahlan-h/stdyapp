import { prisma } from "@stdyapp/core";

// The user allowlist shared by findAllPosts, findLikesByPost and listMembers.
// It is what keeps passwordHash and email out of a public comment thread, so it
// must stay a select rather than becoming `user: true`. Named here because this
// file uses it three times; the others inline it.
const COMMENT_AUTHOR_SELECT = {
  select: { id: true, username: true, avatarUrl: true },
};

export const createComment = ({ userId, postId, body }) => {
  return prisma.comment.create({
    data: { userId, postId, body },
    include: { user: COMMENT_AUTHOR_SELECT },
  });
};

// Deliberately bare — no include. Every caller of this is an authorisation gate
// in the service, which needs userId and postId and nothing else; joining the
// author onto a row that is then discarded would be waste on every write.
export const findCommentById = (id) => {
  return prisma.comment.findUnique({ where: { id } });
};

// The same row, for the one caller that RETURNS it to a client rather than
// gating on it. Split from findCommentById rather than adding the include there
// so the gates above stay cheap — and so nothing has to remember to strip an
// author that a write path never wanted.
export const findCommentWithAuthorById = (id) => {
  return prisma.comment.findUnique({
    where: { id },
    include: { user: COMMENT_AUTHOR_SELECT },
  });
};

/**
 * One post's comment thread.
 *
 * ASCENDING, which is the opposite of every other list in this API and is not a
 * mistake: a feed reads backwards in time, but a conversation reads forwards.
 * Reversing this would put the reply above the thing it replies to.
 *
 * Served straight out of @@index([postId, createdAt]) on comments. The `id`
 * tiebreaker matters for the same reason it does in findAllPosts — createdAt is
 * not unique, and two comments posted in the same millisecond otherwise have no
 * defined order for a client to paginate or diff against.
 */
export const findCommentsByPost = (postId) => {
  return prisma.comment.findMany({
    where: { postId },
    include: { user: COMMENT_AUTHOR_SELECT },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
};

// The post is included for the reason findLikesByUser includes it: a bare list
// of {id, body, postId} is useless to a client rendering "comments you've left",
// which would have to re-fetch every post to show what was being replied to.
export const findCommentsByUser = (userId) => {
  return prisma.comment.findMany({
    where: { userId },
    include: { post: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
};

/**
 * One page of EVERY comment, newest first, with the totals a pager needs.
 *
 * Newest-first here rather than the thread's oldest-first: this is not a
 * conversation, it is a firehose, and the interesting end of a firehose is the
 * recent one. Served by @@index([createdAt]) on comments.
 *
 * The findMany and the count run in one transaction so the page and its total
 * are read from the same snapshot — otherwise a comment inserted between the two
 * queries makes totalPages disagree with the page just returned.
 *
 * @returns {Promise<[object[], number]>} the page, and the total row count
 */
export const findAllComments = ({ skip, take }) => {
  return prisma.$transaction([
    prisma.comment.findMany({
      include: {
        user: COMMENT_AUTHOR_SELECT,
        post: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.comment.count(),
  ]);
};

export const countCommentsByPost = (postId) => {
  return prisma.comment.count({ where: { postId } });
};

// Answers "have I commented on this", the second half of what a comment icon
// renders. findFirst rather than findUnique because (userId, postId) is NOT
// unique here as it is on likes — a person may comment on a post many times.
export const findFirstCommentByUserAndPost = (userId, postId) => {
  return prisma.comment.findFirst({ where: { userId, postId } });
};

export const updateComment = (id, data) => {
  return prisma.comment.update({
    where: { id },
    data,
    include: { user: COMMENT_AUTHOR_SELECT },
  });
};

export const deleteComment = (id) => {
  return prisma.comment.delete({ where: { id } });
};

/**
 * The ids and posts a bulk delete is about to affect.
 *
 * Must be read BEFORE the delete runs: afterwards the rows are gone and there
 * is nothing left to work out which comment threads just went stale. Selects
 * only the two columns invalidation needs rather than whole rows, so a user
 * with thousands of comments does not materialise thousands of bodies to
 * compute a handful of cache keys.
 *
 * No orderBy and no distinct: the caller de-duplicates postIds itself (a Set is
 * free next to a second index scan), and order is meaningless to a set of keys.
 *
 * @returns {Promise<Array<{ id: string, postId: string }>>}
 */
export const findCommentTargetsByUser = (userId) => {
  return prisma.comment.findMany({
    where: { userId },
    select: { id: true, postId: true },
  });
};

// deleteMany rather than delete, exactly as deletePostsByUser does: the tally is
// all a bulk delete needs, not materialising N rows keeps a heavy account
// cleanup cheap, and it does not throw when nothing matches — which is what
// makes "delete all my comments" naturally idempotent.
export const deleteCommentsByUser = (userId) => {
  return prisma.comment.deleteMany({ where: { userId } });
};

/**
 * Everyone who has commented on any of these posts — the mirror of
 * findCommentTargetsByUser, in the opposite direction.
 *
 * Used by invalidatePostFanout in post.service.js: the per-user comment lists
 * embed a whole Post row, so editing or deleting a post makes those cached
 * responses wrong for every user who commented on it.
 *
 * Takes an ARRAY rather than one id so a bulk post delete costs one query
 * regardless of how many posts it removes, instead of one per post.
 *
 * Selects the single column invalidation needs, and skips distinct and orderBy
 * for the reason its counterpart gives: bumpVersions de-duplicates via a Set
 * already, and order is meaningless to a set of keys.
 *
 * @param {string[]} postIds
 * @returns {Promise<Array<{ userId: string }>>}
 */
export const findCommenterIdsByPosts = (postIds) => {
  return prisma.comment.findMany({
    where: { postId: { in: postIds } },
    select: { userId: true },
  });
};
