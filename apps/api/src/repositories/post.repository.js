import { prisma } from "@stdyapp/core";

/**
 * Creates a post and claims its photos, in ONE transaction.
 *
 * Each photo is claimed with a conditional update - still this author's, still
 * unattached - and the whole post rolls back if any claim misses. That closes
 * two races at once: two posts claiming the same upload, and the abandoned-
 * upload sweep deleting one between the service's checks and this write.
 * deleteUnattachedPhotos takes the same "postId IS NULL" condition from the
 * other side, so exactly one of them wins for each row.
 *
 * Its group shares are written in the same transaction, so a post never
 * exists for a moment without the audience it was made for.
 *
 * @param {{ userId: string, sessionId: string | null, routineId: string | null,
 *           title: string, caption: string | null, photoIds: string[],
 *           shareToFollowers: boolean, groupIds: string[] }} input -
 *           photoIds in display order
 * @returns {Promise<object | null>} the post, or null when a photo could not
 *   be claimed
 */
export const createPostWithPhotos = ({
  userId,
  sessionId,
  routineId,
  title,
  caption,
  photoIds,
  shareToFollowers = true,
  groupIds = [],
}) =>
  prisma
    .$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          userId,
          sessionId,
          routineId,
          title,
          caption,
          shareToFollowers,
          groupShares: { create: groupIds.map((groupId) => ({ groupId })) },
        },
      });

      for (const [position, id] of photoIds.entries()) {
        const { count } = await tx.postPhoto.updateMany({
          where: { id, userId, postId: null },
          data: { postId: post.id, position },
        });
        if (count !== 1) throw new PhotoClaimFailed();
      }

      return post;
    })
    .catch((err) => {
      if (err instanceof PhotoClaimFailed) return null;
      throw err;
    });

/** Rolls the transaction back; never leaves this module. */
class PhotoClaimFailed extends Error {}

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
/**
 * A person a session was studied WITH - someone else in the same group room -
 * as a post's "Studied with" line shows them.
 *
 * The public allowlist the post author already uses, plus two relations that
 * answer "is there a block between this person and the viewer", filtered to
 * the viewer so each is at most one row. toViewerPost drops anyone either
 * returns and strips both before the payload leaves the service: they exist so
 * a block hides a name, never so a client can learn who blocked whom. See the
 * note on User.blockedBy in schema.prisma.
 *
 * @param {string} viewerId
 */
/** Interruptions that mean the phone took over - see InterruptionType. */
const PHONE_INTERRUPTION_TYPES = ["APP_EXIT", "DEVICE_MOTION"];

/**
 * How many finished sessions a user needs BEFORE one for it to count as a
 * personal best. Without a floor, everyone's first sessions are all "bests".
 */
export const PERSONAL_BEST_MIN_EARLIER = 3;

/**
 * Which of these sessions beat every earlier session by the same user, on
 * focus points - the "Personal best" badge on a post.
 *
 * Judged AT THE TIME: only sessions that ended before each one count, so a
 * post keeps its badge after a later session beats it, as a Strava PR does.
 * Strictly greater, so a tie is not a new best.
 *
 * One query for a whole page rather than one per post. Raw SQL because the
 * comparison is per row against that row's own history, which Prisma's query
 * API has no way to say. Served by @@index([userId, endedAt]) on sessions.
 *
 * @param {string[]} sessionIds
 * @returns {Promise<Set<string>>}
 */
export const findPersonalBestSessionIds = async (sessionIds) => {
  if (sessionIds.length === 0) return new Set();

  const rows = await prisma.$queryRaw`
    SELECT s.id
    FROM sessions s
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS earlier, MAX(p."focusPoints") AS best
      FROM sessions p
      WHERE p."userId" = s."userId"
        AND p."endedAt" IS NOT NULL
        AND p."endedAt" < s."endedAt"
    ) history
    WHERE s.id = ANY(${sessionIds}::text[])
      AND s."endedAt" IS NOT NULL
      AND s."focusPoints" > 0
      AND history.earlier >= ${PERSONAL_BEST_MIN_EARLIER}
      AND s."focusPoints" > history.best
  `;

  return new Set(rows.map((row) => row.id));
};

const studyBuddySelect = (viewerId) => ({
  select: {
    id: true,
    username: true,
    avatarUrl: true,
    firstName: true,
    lastName: true,
    blocking: { where: { blockedId: viewerId }, select: { blockerId: true } },
    blockedBy: { where: { blockerId: viewerId }, select: { blockedId: true } },
  },
});

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
  //
  // tasksTotal / tasksCompleted are null for a session that never had a task
  // list, which the card shows as a dash rather than "0/0".
  //
  // focusScore and plannedMinutes feed the Focus stat and the "Hit the plan"
  // badge; the interruption count is only the PHONE kinds (leaving the app,
  // picking the phone up), for the "Phone-free" badge - a break the user
  // logged themselves is not a distraction. See services/postSession.js.
  //
  // The two room relations are who it was studied WITH: `participants` when
  // this session hosted a group room, `hostSession` (its owner, plus everyone
  // else who joined) when it joined one. toViewerPost flattens both into one
  // `studiedWith` list - see there.
  // In display order, with the dimensions the app measured so it can size the
  // frame before the image loads. Ids too, for keys in a list.
  photos: {
    orderBy: { position: "asc" },
    select: { id: true, url: true, width: true, height: true },
  },
  session: {
    select: {
      startedAt: true,
      endedAt: true,
      // A post's time is studied time, breaks left out - see sessionPause.js.
      pausedSeconds: true,
      focusPoints: true,
      tasksTotal: true,
      tasksCompleted: true,
      focusScore: true,
      plannedMinutes: true,
      _count: {
        select: {
          interruptions: { where: { type: { in: PHONE_INTERRUPTION_TYPES } } },
        },
      },
      participants: { select: { user: studyBuddySelect(viewerId) } },
      hostSession: {
        select: {
          user: studyBuddySelect(viewerId),
          participants: { select: { user: studyBuddySelect(viewerId) } },
        },
      },
    },
  },
  // Null whenever the post has no routine, or it was deleted - routineId is
  // nullable and SetNull, as sessionId is. Just enough for the card's "Routine"
  // chip: the tasks themselves come from GET /api/routines/:id/preview when the
  // chip is opened, which is block-gated, so a feed row never carries them.
  //
  // The title is cached on every post that links it, so renaming a routine
  // must invalidate those posts - see updateRoutine in studyRoutine.service.js.
  routine: {
    select: { id: true, title: true },
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
  // Where it was shared. Read for every row but kept by the service only for
  // the post's AUTHOR (see toViewerPost): who else it went to is theirs to
  // know, not every reader's.
  groupShares: { select: { group: { select: { id: true, name: true } } } },
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

/**
 * The posts a viewer may see, as a `where`: their own, everything shared to
 * followers, and anything shared to a group they are in. The one definition of
 * "can see" every list here takes, so no read can disagree with another about
 * whether a group-only post is visible.
 *
 * @param {string} viewerId
 */
export const visibleTo = (viewerId) => ({
  OR: [
    { userId: viewerId },
    { shareToFollowers: true },
    { groupShares: { some: { group: { memberships: { some: { userId: viewerId } } } } } },
  ],
});

// Newest first, matching findSessionsByUser — a feed reads backwards in time.
// Served straight out of the @@index([userId, createdAt]) on posts.
//
// viewerId is NOT userId: this is the profile feed, so the rows belong to
// userId while isLiked/isReported are questions about whoever is looking. They
// are the same id only when reading your own profile - and only the viewer's
// own profile shows every post; anyone else's shows what visibleTo allows.
export const findPostsByUser = (userId, viewerId) => {
  return prisma.post.findMany({
    where: userId === viewerId ? { userId } : { AND: [{ userId }, visibleTo(viewerId)] },
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
/**
 * @param {{ audience: object }} query - which posts this feed is of, as a
 *   `where` the service builds (see feedWhere in post.service.js). Combined
 *   with the date window by AND, so neither can widen the other.
 */
export const findAllPosts = ({ skip, take, sort = "recent", from, to, audience = {} }, viewerId) => {
  const where = {
    AND: [
      // Undefined bounds are skipped by Prisma, so an absent end is no bound at all.
      from || to ? { createdAt: { gte: from, lt: to } } : {},
      audience,
    ],
  };

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
 * The ids of every post by this user - read BEFORE deletePostsByUser runs, for
 * cache invalidation, since afterwards there is nothing left to read. Their
 * photos are read separately (findPhotosOfPosts in postPhoto.repository.js),
 * for the same reason.
 *
 * Named to match findPostRefsBySession / findPostRefsByRoutine below, which
 * return refs for exactly the same read-before-delete reason.
 *
 * @returns {Promise<Array<{ id: string }>>}
 */
export const findPostRefsByUser = (userId) => {
  return prisma.post.findMany({
    where: { userId },
    select: { id: true },
  });
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
