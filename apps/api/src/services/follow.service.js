import * as followRepo from "../repositories/follow.repository.js";
// The only sanctioned way to reach prisma.user from here — see post.service.js.
// It throws its own 404, which is exactly the existence check every read below
// needs, so nothing here re-implements one.
import { getUserById } from "./user.service.js";
// The REPOSITORY, never block.service.js. That module imports this one — it calls
// unfollowUser and removeFollower to sever both edges when a block is created —
// so a service-level import here would close the loop into a cycle. Reaching for
// the repository keeps the dependency one-way, and costs nothing: the only thing
// needed below is one indexed lookup with no policy attached.
import { findBlockBetween } from "../repositories/block.repository.js";
// The shared duck-typing helper. toHttpError from the same module is
// deliberately NOT reused, for the reasons spelled out in like.service.js: its
// P2002 message would read "That value is already in use" for a repeat follow,
// and it maps P2003 to a 409 when a bad followingId is plainly a 404.
import { isPrismaError } from "../utils/prismaError.js";
import { bumpVersions, followUserVersionKey } from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — like.service.js's, with one addition.
 *
 * Reads are OPEN to any authenticated caller. A follow graph is public social
 * data by definition: a profile already shows everyone's followers, so gating a
 * single edge on ownership would make the API contradict itself.
 *
 * Writes are scoped by the WHERE clause, so the WHERE clause IS the
 * authorisation — which is why there is no forbidden() helper in this module and
 * no ownership check after a read. But unlike likes, there are TWO write scopes
 * here, and keeping them apart is the one genuinely easy thing to get wrong:
 *
 *   - followerId = the caller  — follow, unfollow, bulk unfollow.
 *   - followingId = the caller — removeFollower, and ONLY that.
 *
 * The second is the addition, and it is comment.service.js's moderation rule
 * arriving in a new shape: a follower lands on YOUR profile, so its subject
 * needs a way to remove it. It stops there — you may sever an edge pointing at
 * you, never create one, and never touch an edge you are not an endpoint of.
 *
 * The consequences, stated as choices rather than oversights:
 *   - Self-following is REJECTED, which is where this diverges from likes. A
 *     self-like is harmless noise; a self-follow corrupts every count the app
 *     renders and would sit in your own "following" list forever.
 *   - Removing a follower does not, on its own, stop them following again a
 *     second later. Blocking is what closes that: followUser below refuses an
 *     edge in either direction when a block exists, and block.service.js severs
 *     both edges when one is created. There is still no mute and no private
 *     account.
 *   - Blocking does not yet hide posts, comments or likes from a blocked user.
 *     That filtering is scoped separately; see the TODO in block.service.js.
 *
 * No function here may take a target userId from the path or body for the
 * SCOPING half of a write.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

/**
 * The only 400 raised below the controller, and it belongs here rather than
 * there: the schema carries no CHECK constraint (Prisma cannot express one), so
 * this function is the sole thing standing between the API and a self-edge. A
 * guard in the controller would be bypassed by any future caller of the service.
 */
const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Invalidates every cached read a follow write can affect.
 *
 * BOTH ends, always. One edge changes four surfaces — the follower's following
 * list, the followee's follower list, and both users' summaries — and a single
 * counter per user covers all of them, so this is two bumps rather than the four
 * the like module needs.
 *
 * Lives in the service rather than the middleware for the reason
 * invalidateComment gives: this is the only layer that holds both endpoints of
 * the edge a change touched. The controllers here are deliberately thin.
 *
 * Nothing here can fail a write. bumpVersions swallows its own Redis errors, so
 * an outage costs a bump and leaves entries stale until their TTL lapses; it
 * never turns a successful 201 into a 500.
 *
 * Awaited rather than fired and forgotten, so a client that reads straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {{ followerId: string, followingId: string }} edge
 */
const invalidateFollow = async ({ followerId, followingId }) => {
  await bumpVersions([
    followUserVersionKey(followerId),
    followUserVersionKey(followingId),
  ]);
};

/**
 * Follows a user, idempotently.
 *
 * A repeat follow is NOT a 409, for the reason likePost gives at length: this is
 * a button fired optimistically by a client that has already flipped its label
 * locally, so it arrives twice from a double-tap, from a retry on a flaky
 * connection, and from an app resumed with stale state. A 409 would force every
 * client to write "if 409, treat as success".
 *
 * The distinction is still preserved where it is free — `created` lets the
 * controller answer 201 or 200 without the caller having to care.
 *
 * @returns {Promise<{ follow: object, created: boolean }>}
 */
export const followUser = async ({ followerId, followingId }) => {
  // Before the existence check, so following yourself is a 400 rather than a
  // wasted query — and so the message names the real problem.
  if (followerId === followingId) {
    throw badRequest("You cannot follow yourself");
  }

  // Throws 404 if there is no such user. Without it a bad followingId reaches
  // Postgres and comes back as a P2003 foreign-key violation, which nothing in
  // the error middleware translates — the client would get a 500 for what is
  // plainly a bad request.
  await getUserById(followingId);

  /**
   * A block in EITHER direction refuses the edge. Without this half, blocking is
   * inert: the blocked user simply follows again a second later, which is the
   * product gap the note at the top of this module used to record.
   *
   * Both directions, not just "they blocked me". If I blocked someone, following
   * them is incoherent — I asked not to see them — and allowing it would let a
   * client resurrect a relationship the block had just severed.
   *
   * THE TWO ANSWERS ARE DIFFERENT ON PURPOSE, and this is the one place in the
   * API where the status code depends on which side of a row the caller is:
   *
   *   - The caller is the BLOCKER. They already know they blocked this person, so
   *     there is nothing to protect and a plain message is simply more useful.
   *
   *   - The caller is the BLOCKED party. They must be told nothing that
   *     distinguishes this from an unknown id, so this is byte-identical to the
   *     404 getUserById raises above — same status, same message. A distinct code
   *     or message here would be a "you have been blocked" notification by
   *     another name, which is precisely the alt-account signal block.service.js
   *     exists to withhold.
   *
   * After getUserById rather than before it, so a bad id is still a 404 about the
   * id rather than a 404 that quietly means something else.
   */
  const block = await findBlockBetween(followerId, followingId);
  if (block) {
    if (block.blockerId === followerId) {
      throw badRequest("You cannot follow someone you have blocked");
    }
    throw notFound("User");
  }

  const existing = await followRepo.findFollow(followerId, followingId);
  // Nothing changed, so nothing to invalidate — the cheap path stays cheap.
  if (existing) return { follow: existing, created: false };

  try {
    const follow = await followRepo.createFollow({ followerId, followingId });
    await invalidateFollow(follow);
    return { follow, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const follow = await followRepo.findFollow(followerId, followingId);
      // Bumped even though `created` is false. Unlike the early return above, a
      // row genuinely WAS inserted here — by the request that won the race. Its
      // own bump covers this, but bumping twice only orphans a key, while
      // missing one serves a stale button for the whole TTL.
      if (follow) {
        await invalidateFollow(follow);
        return { follow, created: false };
      }
    }
    // The target was deleted inside that same window. The check above was honest
    // when it ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) throw notFound("User");
    throw err;
  }
};

/**
 * The mirror of followUser's idempotency: unfollowing someone you never followed
 * is not an error, it is the state you asked for. deleteMany does not throw on a
 * miss, so no 404 is possible here.
 *
 * followerId is always the caller's own id from the access token — that WHERE
 * clause is the entire authorisation, which is why this needs no ownership check
 * and must never accept a caller-supplied followerId.
 *
 * @returns {Promise<{ count: number }>}
 */
export const unfollowUser = async (followingId, followerId) => {
  const result = await followRepo.deleteFollow(followerId, followingId);

  // Only when a row actually went. deleteMany reports count 0 for the "unfollow
  // someone you never followed" case, which changed nothing and must not spend a
  // bump — this route is a toggle clients fire freely.
  if (result.count > 0) await invalidateFollow({ followerId, followingId });

  return result;
};

/**
 * "Remove this follower" — the moderation half of the model at the top.
 *
 * Deliberately a SEPARATE function from unfollowUser rather than the same one
 * with a direction flag, and the split is the safety property. The two differ
 * only in which end of the edge is pinned to the caller, which is precisely the
 * kind of thing a boolean gets passed the wrong way round for once, silently,
 * and never noticed — at which point anyone could sever anyone else's edges.
 * Two functions cannot be miscalled. Same reasoning as comment.service.js's two
 * separate gates.
 *
 * followingId is always the caller's own id from the access token.
 *
 * @returns {Promise<{ count: number }>}
 */
export const removeFollower = async (followerId, followingId) => {
  const result = await followRepo.deleteFollow(followerId, followingId);

  if (result.count > 0) await invalidateFollow({ followerId, followingId });

  return result;
};

/**
 * Everything a Follow button needs, in one round trip.
 *
 * Mirrors getLikeSummary, with one field it has no counterpart for: `followsMe`.
 * A heart is symmetric — there is nothing to say about the post's relationship
 * to you — but a follow is directed, and "Follows you" is a badge every client
 * renders. Without it here, showing that badge would cost a second call.
 *
 * All four queries are served by indexes on follows, so the set costs about what
 * the two counts alone would.
 */
export const getFollowSummary = async (targetUserId, viewerId) => {
  await getUserById(targetUserId);

  const [followers, following, mine, theirs] = await Promise.all([
    followRepo.countFollowers(targetUserId),
    followRepo.countFollowing(targetUserId),
    followRepo.findFollow(viewerId, targetUserId),
    followRepo.findFollow(targetUserId, viewerId),
  ]);

  return {
    userId: targetUserId,
    followers,
    following,
    followedByMe: Boolean(mine),
    followsMe: Boolean(theirs),
  };
};

/**
 * One user's followers.
 *
 * The user is looked up first so an unknown id is a 404 rather than an empty
 * array — a client cannot otherwise tell "no such user" from "nobody follows
 * them", and those want different UI. Same reasoning as listLikesByPost.
 *
 * Not paginated, matching listLikesByPost and listCommentsByPost. Every
 * unpaginated list in this API shares that ceiling, and a follower list is the
 * one most likely to reach it first; @@index([followingId]) is what makes adding
 * a cursor here cheap when it does.
 */
export const listFollowersByUser = async (targetUserId) => {
  await getUserById(targetUserId);
  return followRepo.findFollowersByUser(targetUserId);
};

// Byte-identical to listFollowersByUser(caller), minus the existence check the
// caller's own token makes redundant — the exact relationship listMyFollowing
// has with listFollowingByUser. The two share a cache key; see followersKey in
// utils/cache.js.
export const listMyFollowers = async (userId) => {
  return followRepo.findFollowersByUser(userId);
};

/**
 * One user's following list — their "following" tab.
 *
 * A separate function from listMyFollowing rather than a parameter on it,
 * exactly as listLikesByUser is separate from listMyLikes: a caller passing the
 * wrong id into a combined function would silently become an access-control
 * hole.
 */
export const listFollowingByUser = async (targetUserId) => {
  await getUserById(targetUserId);
  return followRepo.findFollowingByUser(targetUserId);
};

// Byte-identical to listFollowingByUser(caller), minus the existence check the
// caller's own token makes redundant. The two deliberately share a cache key —
// see followingKey in utils/cache.js.
export const listMyFollowing = async (userId) => {
  return followRepo.findFollowingByUser(userId);
};

/**
 * One page of every follow edge in the system.
 *
 * No ownership gate, consistent with the authorisation note at the top of this
 * module: the follow graph is public social data, and only WRITES are scoped to
 * the token holder. Authentication is still required, at the router.
 *
 * Returns the { items, total, page, limit } shape listUsers returns.
 */
export const listAllFollows = async ({ page, limit }) => {
  const [items, total] = await followRepo.findAllFollows({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/**
 * "Unfollow everyone". No ownership check, and none is needed: userId is always
 * the caller's own id from the access token, so the WHERE clause IS the
 * authorisation. The route must never accept a target id from the path or body —
 * there is no admin role in this codebase, so a caller-supplied id here would
 * let anyone empty anyone else's following list.
 *
 * Note what this does NOT do: it removes the edges the caller CREATED, never the
 * ones pointing at them. "Unfollow everyone" and "make everyone unfollow me" are
 * different operations, and only the first is one the caller owns.
 *
 * Unlike deleteMyComments, this is not an escape hatch for a Restrict on the
 * foreign key — both of follows' FKs cascade, so a user delete is never blocked
 * by their follows. This exists for the product.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyFollows = async (userId) => {
  // Read the targets BEFORE the delete. Afterwards the rows are gone and there
  // is no way left to work out whose follower lists just went stale.
  const targets = await followRepo.findFollowingTargetsByUser(userId);

  const result = await followRepo.deleteFollowsByUser(userId);

  // Nothing was deleted, so nothing is stale. Saves a round trip on the repeat
  // call this idempotent route is designed to tolerate.
  if (result.count === 0) return result;

  // One counter per person unfollowed, plus the caller's own. bumpVersions
  // de-duplicates and chunks its pipeline, so a heavy account clearing hundreds
  // of follows is a handful of round trips rather than one per row.
  await bumpVersions([
    followUserVersionKey(userId),
    ...targets.map(({ followingId }) => followUserVersionKey(followingId)),
  ]);

  return result;
};
