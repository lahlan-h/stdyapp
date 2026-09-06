import { prisma } from "@stdyapp/core";

// The user allowlist shared by findAllPosts, findLikesByPost and listMembers.
// It is what keeps passwordHash and email out of a public follower list, so it
// must stay a select rather than becoming `user: true`. Named here because this
// file uses it four times; the like repository inlines its copy.
const FOLLOW_USER_SELECT = {
  select: { id: true, username: true, avatarUrl: true },
};

// The follow is returned with the person being followed joined on, because the
// one caller that returns it to a client is rendering "you now follow X".
export const createFollow = ({ followerId, followingId }) => {
  return prisma.follow.create({
    data: { followerId, followingId },
    include: { following: FOLLOW_USER_SELECT },
  });
};

// The compound-unique lookup, the same shape as findLikeByUserAndPost — follows
// has no natural single-column key other than its id, and no caller ever knows
// that id: a client holds the other person's id and its own token, which is
// exactly this pair.
export const findFollow = (followerId, followingId) => {
  return prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
  });
};

/**
 * Everyone who follows this user.
 *
 * Ordered by the follower's username, copying findLikesByPost. This is the one
 * real cost of Follow having no createdAt: there is no chronological key to sort
 * by, and WITHOUT an orderBy Postgres returns whatever the plan yields — which
 * changes once the table grows and the planner switches from a sequential scan
 * to an index scan, quietly breaking any pagination built on top.
 *
 * Alphabetical is arbitrary but deterministic, and at least defensible to a
 * human reading the list. A chronological "recent followers" list is impossible
 * until a createdAt column is added.
 *
 * Served by @@index([followingId]) on follows, which exists precisely because
 * the unique constraint leads with followerId and cannot answer this.
 */
export const findFollowersByUser = (userId) => {
  return prisma.follow.findMany({
    where: { followingId: userId },
    include: { follower: FOLLOW_USER_SELECT },
    orderBy: { follower: { username: "asc" } },
  });
};

// The mirror, in the other direction: everyone this user follows. Served by the
// leading column of @@unique([followerId, followingId]).
export const findFollowingByUser = (userId) => {
  return prisma.follow.findMany({
    where: { followerId: userId },
    include: { following: FOLLOW_USER_SELECT },
    orderBy: { following: { username: "asc" } },
  });
};

export const countFollowers = (userId) => {
  return prisma.follow.count({ where: { followingId: userId } });
};

export const countFollowing = (userId) => {
  return prisma.follow.count({ where: { followerId: userId } });
};

/**
 * One page of EVERY follow edge, with the totals a pager needs.
 *
 * Ordered by the follower's username because Follow has no createdAt of its
 * own — the deliberate omission documented on the model. That means this sort
 * runs on a JOINED column and can be served by no index on follows, so each page
 * sorts the whole join. Fine at current volumes, and the first thing to change
 * if this route gets slow; the real fix is a createdAt column on Follow, which
 * is the debt already recorded on findFollowersByUser above.
 *
 * Ordering by id alone would be indexable and stable, but a list ordered by
 * random uuid is not browsable by a human, which is the point of the route.
 *
 * The id tiebreaker is required for the same reason as in findAllLikes:
 * usernames are unique today but the ordering key is a joined column either
 * way, and an unstable tie duplicates or skips rows across page boundaries.
 *
 * The findMany and the count run in one transaction so the page and its total
 * are read from the same snapshot.
 *
 * @returns {Promise<[object[], number]>} the page, and the total row count
 */
export const findAllFollows = ({ skip, take }) => {
  return prisma.$transaction([
    prisma.follow.findMany({
      include: {
        follower: FOLLOW_USER_SELECT,
        following: FOLLOW_USER_SELECT,
      },
      orderBy: [{ follower: { username: "asc" } }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.follow.count(),
  ]);
};

/**
 * Removes one edge.
 *
 * deleteMany rather than delete, for the same reason deleteLikeByUserAndPost
 * uses it: it does not throw when nothing matches. That is what makes unfollow a
 * safe toggle — a client that taps twice, or retries after a dropped response,
 * gets the same 204 instead of a P2025 the error middleware would turn into a
 * 500.
 *
 * Takes the pair in fixed (follower, followee) order and NEVER a "direction"
 * flag. Both service callers scope on their own end of the edge, and a boolean
 * that swapped which end is authorised is exactly the thing that gets passed the
 * wrong way round once, silently.
 */
export const deleteFollow = (followerId, followingId) => {
  return prisma.follow.deleteMany({ where: { followerId, followingId } });
};

/**
 * The people one user follows — for cache invalidation, not for reading.
 *
 * Must be read BEFORE deleteFollowsByUser runs: afterwards the rows are gone and
 * there is nothing left to work out whose follower lists just went stale. The
 * twin of findLikeTargetsByUser.
 *
 * Selects the single column invalidation needs rather than whole rows, so an
 * account following thousands of people does not materialise thousands of
 * records to compute a handful of cache keys. No distinct and no orderBy:
 * bumpVersions de-duplicates via a Set already, and order is meaningless to a
 * set of keys.
 *
 * @returns {Promise<Array<{ followingId: string }>>}
 */
export const findFollowingTargetsByUser = (userId) => {
  return prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
};

export const deleteFollowsByUser = (userId) => {
  return prisma.follow.deleteMany({ where: { followerId: userId } });
};

/**
 * Everyone on the other end of an edge from this user, in EITHER direction.
 *
 * Used by collectUserVersionKeys in user.service.js. Follower and following
 * lists embed the counterparty's username and avatarUrl, so renaming a user
 * makes every list they appear in stale — and they appear in the following list
 * of each of their followers and the follower list of everyone they follow.
 *
 * Two separate indexed reads rather than one `OR`: the two directions are served
 * by two different indexes (the unique's leading column, and the standalone
 * index on followingId), and an OR spanning both is the shape Postgres is least
 * likely to plan well.
 *
 * Returns bare ids, and duplicates are fine — a mutual follow appears twice, and
 * bumpVersions de-duplicates via a Set already.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findFollowCounterpartIdsByUser = async (userId) => {
  const [following, followers] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    }),
  ]);

  return [
    ...following.map(({ followingId }) => followingId),
    ...followers.map(({ followerId }) => followerId),
  ];
};
