import { prisma } from "@stdyapp/core";

import { authorVisibleTo } from "./post.repository.js";

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

// --- Follow requests -------------------------------------------------------
//
// A follow waiting on a private account. See the FollowRequest model.

const REQUESTER_SELECT = {
  select: { id: true, username: true, firstName: true, lastName: true, avatarUrl: true },
};

export const findFollowRequest = (requesterId, targetId) => {
  return prisma.followRequest.findUnique({
    where: { requesterId_targetId: { requesterId, targetId } },
  });
};

/**
 * Asks, idempotently: a second ask is the same row, with its createdAt kept so
 * asking again does not jump the queue.
 */
export const upsertFollowRequest = (requesterId, targetId) => {
  return prisma.followRequest.upsert({
    where: { requesterId_targetId: { requesterId, targetId } },
    create: { requesterId, targetId },
    update: {},
  });
};

// deleteMany, for deleteFollow's reason: answering or cancelling twice is not
// an error.
export const deleteFollowRequest = (requesterId, targetId) => {
  return prisma.followRequest.deleteMany({ where: { requesterId, targetId } });
};

/** Requests waiting for this user's answer, newest first, with who asked. */
export const findIncomingFollowRequests = (targetId) => {
  return prisma.followRequest.findMany({
    where: { targetId },
    include: { requester: REQUESTER_SELECT },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Accepts: the follow is created and the request deleted together, so the two
 * can never both exist, nor both be missing after an accept.
 *
 * Resolves false when there was no request to accept - answered already, or
 * cancelled a moment ago - in which case nothing was written.
 *
 * @returns {Promise<boolean>}
 */
export const acceptFollowRequest = (requesterId, targetId) => {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.followRequest.deleteMany({
      where: { requesterId, targetId },
    });
    if (count === 0) return false;

    // skipDuplicates: a follow that somehow already exists is the outcome
    // asked for, not a conflict.
    await tx.follow.createMany({
      data: [{ followerId: requesterId, followingId: targetId }],
      skipDuplicates: true,
    });
    return true;
  });
};

/**
 * Accepts every request waiting on one user at once - an account going public.
 *
 * @returns {Promise<string[]>} the requesters, now followers
 */
export const acceptAllFollowRequests = (targetId) => {
  return prisma.$transaction(async (tx) => {
    const requests = await tx.followRequest.findMany({
      where: { targetId },
      select: { requesterId: true },
    });
    if (requests.length === 0) return [];

    await tx.follow.createMany({
      data: requests.map(({ requesterId }) => ({ followerId: requesterId, followingId: targetId })),
      skipDuplicates: true,
    });
    await tx.followRequest.deleteMany({
      where: { targetId, requesterId: { in: requests.map(({ requesterId }) => requesterId) } },
    });
    return requests.map(({ requesterId }) => requesterId);
  });
};

/** Requests in EITHER direction between two users - for a new block. */
export const deleteFollowRequestsBetween = (a, b) => {
  return prisma.followRequest.deleteMany({
    where: {
      OR: [
        { requesterId: a, targetId: b },
        { requesterId: b, targetId: a },
      ],
    },
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

// Just the ids of everyone this user follows - the "following" feed's author
// list. Ids only, because the feed joins its own author columns per post.
export const findFollowingIds = async (userId) => {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  return rows.map((row) => row.followingId);
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
export const findAllFollows = ({ skip, take, viewerId }) => {
  // Only edges whose BOTH ends the viewer may see: who a private account
  // follows, and who follows it, are its to show. See authorVisibleTo.
  const where = {
    follower: authorVisibleTo(viewerId),
    following: authorVisibleTo(viewerId),
  };
  return prisma.$transaction([
    prisma.follow.findMany({
      where,
      include: {
        follower: FOLLOW_USER_SELECT,
        following: FOLLOW_USER_SELECT,
      },
      orderBy: [{ follower: { username: "asc" } }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.follow.count({ where }),
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
