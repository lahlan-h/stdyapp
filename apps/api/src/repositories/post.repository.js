import { prisma } from "@stdyapp/core";

export const createPost = ({
  userId,
  sessionId,
  routineId,
  title,
  caption,
  photoUrl,
}) => {
  return prisma.post.create({
    data: { userId, sessionId, routineId, title, caption, photoUrl },
  });
};

export const findPostById = (id) => {
  return prisma.post.findUnique({ where: { id } });
};

/**
 * Everything a rendered post needs, for ONE viewer.
 *
 * Extracted so the global feed and the per-user list cannot drift: they render
 * through the same client component, so a field present in one and absent from
 * the other is a crash there rather than a missing line. Each clause carries
 * the discipline behind it inline — particularly the two viewer-filtered
 * relations, neither of which may ever become unfiltered.
 *
 * @param {string} viewerId - the caller's own id; guaranteed by requireAuth
 */
const postInclude = (viewerId) => ({
  // The allowlist already used by findLikesByPost and listMembers. It is what
  // keeps passwordHash and email out of a public feed, so it must stay a select
  // rather than becoming `user: true`.
  user: {
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      firstName: true,
      lastName: true,
    },
  },
  // Null whenever the post has no session, or the session was deleted -
  // sessionId is nullable and SetNull. The feed renders the stats only when
  // this resolves. endedAt is null while a session is still running, which is
  // not the same as a duration of zero, so it is passed through rather than
  // flattened here.
  session: {
    select: { startedAt: true, endedAt: true, focusPoints: true },
  },
  // Answers a question _count cannot: that is a total over everyone, so a heart
  // rendered from it has no way to know its own colour. This one is filtered to
  // the VIEWER, and by the unique (userId, postId) it matches at most one row -
  // so its length is the whole answer, which the service flattens to a boolean
  // before anything reaches the wire.
  //
  // It takes the same discipline the user clause above documents: a select of
  // `id` alone, never `likes: true`, which would put every liker's id on every
  // row of a public feed.
  likes: { where: { userId: viewerId }, select: { id: true } },
  // The same discipline, for the same question in a different register: "have I
  // reported this". Filtered to the VIEWER, capped at one row by
  // @@unique([reporterId, targetPostId]), and a select of the columns the answer
  // needs, never `reports: true`, which would put every reporter's id on every
  // row of a public feed.
  //
  // `status` comes too because a WITHDRAWN row still exists: the unique keeps it
  // in place so the reporter can file again, so presence alone is not the
  // answer. `reason` comes so the app can tell the reporter what they filed
  // without a second round trip - it is their own sentence being read back to
  // them, which is the one direction this table opens.
  //
  // `details` deliberately does NOT come. It is the only free text here, it is
  // unbounded, and putting it on every row of a paged feed would spend bandwidth
  // on something no feed surface renders.
  //
  // This is the ONLY read of Post.reports, and the only one there may be.
  // Nothing here counts, and nothing here may ever be unfiltered.
  reports: {
    where: { reporterId: viewerId },
    select: { id: true, status: true, reason: true },
  },
  _count: { select: { likes: true, comments: true } },
});

// Newest first, matching findSessionsByUser — a feed reads backwards in time.
// Served straight out of the @@index([userId, createdAt]) on posts.
//
// viewerId is NOT userId: this is the profile feed, so the rows belong to
// userId while isLiked/isReported are questions about whoever is looking. They
// are the same id only when reading your own profile.
export const findPostsByUser = (userId, viewerId) => {
  return prisma.post.findMany({
    where: { userId },
    include: postInclude(viewerId),
    orderBy: { createdAt: "desc" },
  });
};

/**
 * The feed's orders, keyed by FEED_SORTS in validation/post.validation.js.
 *
 * EVERY entry ends in a unique column, and that is load-bearing rather than
 * decoration. Neither createdAt nor a like count is unique, so two posts that tie
 * have no defined relative order, and under OFFSET pagination that is a
 * correctness bug rather than an aesthetic one: the planner may break the tie
 * differently between two requests, and the row then appears on both page 1 and
 * page 2, or on neither. The count sorts fall back to newest-first before the id,
 * so a tie reads in the order the default feed would show it.
 *
 * A count sort can still shift between pages in a way no tiebreaker fixes: a
 * like landing between page 1 and page 2 moves that post across the boundary.
 * Accepted - the alternative is a cursor over a moving aggregate.
 */
const FEED_ORDER = {
  recent: [{ createdAt: "desc" }, { id: "asc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  most_liked: [{ likes: { _count: "desc" } }, { createdAt: "desc" }, { id: "asc" }],
  least_liked: [{ likes: { _count: "asc" } }, { createdAt: "desc" }, { id: "asc" }],
  most_commented: [{ comments: { _count: "desc" } }, { createdAt: "desc" }, { id: "asc" }],
  least_commented: [{ comments: { _count: "asc" } }, { createdAt: "desc" }, { id: "asc" }],
};

/**
 * One page of the GLOBAL feed, with the totals a pager needs.
 *
 * Newest first by default, served by @@index([createdAt]) on posts. The
 * per-user composite index cannot help here: createdAt is its second column, so
 * without an equality predicate on the leading userId there is no usable
 * ordering. The count sorts have no index of their own - Postgres aggregates
 * likes or comments by postId (both indexed) and sorts the result.
 *
 * The date window is half-open, [from, to), and either end may be absent. See
 * listAllPostsQuerySchema for why the bounds arrive as instants.
 *
 * The findMany and the count run in one transaction so the page and its total
 * are read from the same snapshot — otherwise a post inserted between the two
 * queries makes totalPages disagree with the page just returned. They share ONE
 * `where`, too: a count over every post would report pages a filtered feed does
 * not have, and the app would keep asking for them.
 *
 * The user select is the allowlist already used by findLikesByPost and
 * listMembers. It is what keeps passwordHash and email out of a public feed, so
 * it must stay a select rather than becoming `user: true`.
 *
 * The likes clause answers a question _count cannot: that is a total over
 * everyone, so a heart rendered from it has no way to know its own colour. This
 * one is filtered to the VIEWER, and by the unique (userId, postId) it matches
 * at most one row - so its length is the whole answer, which the service
 * flattens to a boolean before anything reaches the wire.
 *
 * It takes the same discipline the user clause above documents: a select of
 * `id` alone, never `likes: true`, which would put every liker's id on every
 * row of a public feed.
 *
 * viewerId is its own parameter rather than a key on the pagination object, so
 * the pair reads the same way at all three layers - listAll passes
 * (query, req.user.id), listAllPosts passes ({ skip, take }, viewerId).
 *
 * @param {{ skip: number, take: number, sort?: string, from?: Date, to?: Date }} page
 * @param {string} viewerId - the caller's own id; guaranteed by requireAuth
 * @returns {Promise<[object[], number]>} the page, and the total row count
 */
export const findAllPosts = ({ skip, take, sort = "recent", from, to }, viewerId) => {
  // Undefined bounds are skipped by Prisma, so an absent end is no bound at all.
  const where = from || to ? { createdAt: { gte: from, lt: to } } : undefined;

  return prisma.$transaction([
    prisma.post.findMany({
      where,
      include: postInclude(viewerId),
      orderBy: FEED_ORDER[sort],
      skip,
      take,
    }),
    prisma.post.count({ where }),
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
 * The two columns a bulk delete needs, and no more.
 *
 * id drives cache invalidation; photoUrl is the ONLY way to work out which R2
 * objects to reclaim, and it stops existing the moment the rows do - so like
 * findPostRefsBySession below, this MUST be read before the delete.
 *
 * It deliberately still does not reuse findPostsByUser. photoUrl is bounded at a
 * couple of hundred bytes, whereas caption is unbounded TEXT, so clearing a
 * heavy account still avoids materialising the expensive half of every row.
 *
 * Named to match findPostRefsBySession / findPostRefsByRoutine below, which
 * return multi-column refs for exactly the same read-before-delete reason.
 *
 * @returns {Promise<Array<{ id: string, photoUrl: string }>>}
 */
export const findPostRefsByUser = (userId) => {
  return prisma.post.findMany({
    where: { userId },
    select: { id: true, photoUrl: true },
  });
};

/**
 * Does any of this user's REMAINING posts still point at this photo?
 *
 * Asked on the delete path, immediately before reclaiming the object, and the
 * answer decides whether the object is still referenced. Deleting it while
 * another row points at it would leave that post with a broken image.
 *
 * Scoped by userId, and not merely as an optimisation: parseOwnedKey has already
 * established the object belongs to this user, so any row that could reference
 * it is theirs. It also lets Postgres use the (userId, createdAt) index to bound
 * the scan to one author instead of the whole table - photoUrl is not indexed,
 * so the filter itself is evaluated per candidate row.
 *
 * Only worth paying on the single delete. deleteMyPosts skips it entirely: every
 * post of that user is going, so no reference can survive.
 *
 * @returns {Promise<number>}
 */
export const countPostsByPhotoUrl = ({ userId, photoUrl }) => {
  return prisma.post.count({ where: { userId, photoUrl } });
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
