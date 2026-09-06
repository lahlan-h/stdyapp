import * as blockRepo from "../repositories/block.repository.js";
// The only sanctioned way to reach prisma.user from here — see follow.service.js.
// It throws its own 404, which is exactly the existence check the reads below
// need, so nothing here re-implements one.
import { getUserById } from "./user.service.js";
// A SERVICE import, not a repository one, which is the deliberate exception to
// how cross-domain work is done in this codebase. See severFollowEdges below.
import { unfollowUser, removeFollower } from "./follow.service.js";
// The shared duck-typing helper. toHttpError from the same module is deliberately
// NOT reused, for the reasons follow.service.js spells out: its P2002 message
// would read "That value is already in use" for a repeat block, and it maps P2003
// to a 409 when a bad blockedId is plainly a 404.
import { isPrismaError } from "../utils/prismaError.js";
import { bumpVersions, blockUserVersionKey } from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — the INVERSE of follow.service.js's, and that inversion is
 * the whole point of this module.
 *
 * follow.service.js opens with "Reads are OPEN to any authenticated caller. A
 * follow graph is public social data by definition." A block graph is the
 * opposite by definition, so:
 *
 *   READS ARE SCOPED TOO. Every function here pins blockerId to the caller's own
 *   id from the access token. There is exactly ONE write scope and exactly ONE
 *   read scope, and they are the same scope. No function may take a blockerId
 *   from the path or the body, on a read or on a write.
 *
 * THE BLOCKED PARTY LEARNS NOTHING. There is no "who blocked me" list, no
 * blockers count, no blocksMe flag, and no route from which either can be
 * derived. Two reasons, and the second is the serious one:
 *   - Privacy: "X blocked Y" is nobody else's business.
 *   - Safety: telling someone they have been blocked tells a harasser precisely
 *     when to create an alt account. Silent blocks are the standard product
 *     answer for exactly this reason.
 * Anything that lets a caller INFER the answer — a distinguishable error code, a
 * count that moves, a list that shrinks — is the same leak wearing a hat. This is
 * why followUser answers a blocked caller with the same 404 an unknown id gets.
 *
 * GET /api/blocks/all is scoped to the caller too, unlike the /all route in every
 * other router. follow.service.js records that "there is no admin role in this
 * codebase"; a global block list with no admin role is a dump of the entire
 * harassment graph to any authenticated caller, which is the single worst thing
 * this file could expose.
 *
 * Consequences, stated as choices rather than oversights:
 *   - Self-blocking is REJECTED (400), the call followUser makes about
 *     self-follows and for a stronger reason: a self-block would filter the
 *     caller out of their own feed.
 *   - Blocking SEVERS the follow edges in both directions, and unblocking does
 *     NOT restore them. Irreversible by design — silently re-following someone
 *     you blocked is the opposite of what the caller asked for.
 *
 * TODO — blocking does not yet hide posts, comments or likes. Full mutual
 * invisibility is a filter on roughly twenty query sites (findAllPosts,
 * findPostsByUser, findCommentsByPost, findAllComments, countCommentsByPost,
 * findLikesByPost, findLikesByUser, listUsers, and the follow lists), and it
 * forces nine currently viewer-less cache keys to become per-viewer — splitting
 * the five that are deliberately shared between a "/mine" route and a
 * "/user/:userId" route. It will need one new repository function returning the
 * blocked ids for a viewer in both directions. Scoped separately; stated here so
 * the gap is recorded rather than assumed closed.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

/**
 * The only 400 raised below the controller, and it belongs here rather than
 * there for the reason follow.service.js gives: the schema carries no CHECK
 * constraint (Prisma cannot express one), so this function is the sole thing
 * standing between the API and a self-edge. A guard in the controller would be
 * bypassed by any future caller of the service.
 */
const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Invalidates every cached read a block write can affect.
 *
 * ONE BUMP, WHERE invalidateFollow NEEDS TWO — and the asymmetry is load-bearing,
 * so do not "fix" it to match.
 *
 * invalidateFollow bumps BOTH endpoints because a follow edge changes four
 * surfaces, two of which belong to the other user. A block edge changes exactly
 * one readable surface: the BLOCKER's own list and their own status flags.
 * Nothing the blocked user can read changes at all — their block list contains
 * only rows where THEY are the blocker, and being blocked does not touch it.
 *
 * Bumping the blocked user's counter would therefore invalidate a cache for no
 * reason, and — worse as documentation — would imply that being blocked is
 * something their side can observe. It is not, and must not become so.
 *
 * Nothing here can fail a write: bumpVersions swallows its own Redis errors, so
 * an outage costs a bump and leaves entries stale until their TTL lapses. Awaited
 * rather than fired and forgotten, so a client that reads straight back after
 * writing cannot observe the version it just invalidated.
 *
 * @param {string} blockerId
 */
const invalidateBlock = async (blockerId) => {
  await bumpVersions([blockUserVersionKey(blockerId)]);
};

/**
 * Blocking someone removes the follow edges in BOTH directions.
 *
 * This is the half of the feature that makes it more than a row: follow.service.js
 * used to record, in its own authorisation note, that "removing a follower does
 * not stop them following again a second later". Severing here and refusing in
 * followUser are the two ends of closing that.
 *
 * Belongs in the service layer, not the repository and not the controller: it is
 * a cross-domain POLICY decision ("a block implies an unfollow"), and the service
 * is the only layer that holds both endpoints of both edges.
 *
 * Calls follow.SERVICE rather than follow.REPOSITORY, which is the exception to
 * the rule user.service.js and post.service.js state ("repository rather than
 * service imports — going through the services would drag their ownership gates
 * along"). Here those gates are exactly what we want: unfollowUser and
 * removeFollower each pin one end of their edge to the caller, which is the same
 * authorisation this module enforces, and each already performs the DOUBLE
 * followUserVersionKey bump a follow edge requires. Reaching for the repository
 * instead would mean a second, drifting copy of that invalidation rule.
 *
 * The two calls are the two directions, and their argument orders differ — copy
 * them, do not derive them:
 *   unfollowUser(blockedId, blockerId)   — I stop following them
 *   removeFollower(blockedId, blockerId) — they stop following me
 * Both bump followUserVersionKey for BOTH users, so all four follow surfaces are
 * correct afterwards. Two round trips rather than one; a block is rare enough
 * that collapsing them is not worth a third copy of the invalidation rule.
 *
 * ONE-WAY DEPENDENCY, FOREVER. block.service.js may import follow.service.js;
 * follow.service.js must NEVER import block.service.js or the two become a cycle.
 * The block check in followUser therefore reaches for block.repository.js.
 *
 * Not reversed by unblockUser. Restoring a follow the caller severed by blocking
 * is the opposite of what they asked for.
 *
 * @param {string} blockerId
 * @param {string} blockedId
 */
const severFollowEdges = async (blockerId, blockedId) => {
  await unfollowUser(blockedId, blockerId);
  await removeFollower(blockedId, blockerId);
};

/**
 * Blocks a user, idempotently.
 *
 * A repeat block is NOT a 409, for the reason followUser gives: this is a menu
 * item fired by a client that has already updated its own state, so it arrives
 * twice from a double-tap, from a retry on a flaky connection, and from an app
 * resumed with stale state. A 409 would force every client to write "if 409,
 * treat as success".
 *
 * The distinction is still preserved where it is free — `created` lets the
 * controller answer 201 or 200 without the caller having to care.
 *
 * @returns {Promise<{ block: object, created: boolean }>}
 */
export const blockUser = async ({ blockerId, blockedId }) => {
  // Before the existence check, so blocking yourself is a 400 rather than a
  // wasted query — and so the message names the real problem.
  if (blockerId === blockedId) {
    throw badRequest("You cannot block yourself");
  }

  // Throws 404 if there is no such user. Without it a bad blockedId reaches
  // Postgres and comes back as a P2003 foreign-key violation, which nothing in
  // the error middleware translates — the client would get a 500 for what is
  // plainly a bad request.
  await getUserById(blockedId);

  const existing = await blockRepo.findBlock(blockerId, blockedId);
  // Nothing changed, so nothing to invalidate and nothing to sever — the follow
  // edges went the first time this ran, and unblocking does not restore them.
  if (existing) return { block: existing, created: false };

  try {
    const block = await blockRepo.createBlock({ blockerId, blockedId });

    // AFTER the insert, deliberately. The block row is the durable record of
    // what the caller asked for; if a follow delete fails, the block must still
    // stand rather than being rolled back into a state the caller did not want.
    await severFollowEdges(blockerId, blockedId);
    await invalidateBlock(blockerId);

    return { block, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const block = await blockRepo.findBlock(blockerId, blockedId);
      if (block) {
        // Severed and bumped even though `created` is false. Unlike the early
        // return above, a row genuinely WAS inserted here — by the request that
        // won the race — and it may not have finished severing yet. Two
        // deleteManys that usually match nothing is a cheap price for closing
        // that window, and bumping twice only orphans a key while missing one
        // serves a stale list for the whole TTL.
        await severFollowEdges(blockerId, blockedId);
        await invalidateBlock(blockerId);
        return { block, created: false };
      }
    }
    // The target was deleted inside that same window. The check above was honest
    // when it ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) throw notFound("User");
    throw err;
  }
};

/**
 * The mirror of blockUser's idempotency: unblocking someone you never blocked is
 * not an error, it is the state you asked for. deleteMany does not throw on a
 * miss, so no 404 is possible here.
 *
 * blockerId is always the caller's own id from the access token — that WHERE
 * clause is the entire authorisation, which is why this needs no ownership check
 * and must never accept a caller-supplied blockerId.
 *
 * The argument order deliberately matches unfollowUser's (target first, caller
 * second) so the two read identically at their call sites.
 *
 * Note what this does NOT do: it does not restore the follow edges the block
 * severed. See severFollowEdges.
 *
 * There is also no removeBlocker counterpart, and that is the most important
 * omission in this file. removeFollower exists because a follower lands on YOUR
 * profile and its subject needs a way to remove it; a block lands nowhere the
 * blocked party can see, so there is nothing to remedy — and a route to do it
 * would itself be the leak, since only someone who knows they are blocked could
 * call it.
 *
 * @returns {Promise<{ count: number }>}
 */
export const unblockUser = async (blockedId, blockerId) => {
  const result = await blockRepo.deleteBlock(blockerId, blockedId);

  // Only when a row actually went. deleteMany reports count 0 for the "unblock
  // someone you never blocked" case, which changed nothing and must not spend a
  // bump — this route is a toggle clients fire freely.
  if (result.count > 0) await invalidateBlock(blockerId);

  return result;
};

/**
 * Everything a Block menu item needs, and DELIBERATELY ONLY HALF of what
 * getFollowSummary returns.
 *
 * getFollowSummary carries followsMe as well as followedByMe, because "Follows
 * you" is a public badge. The equivalent field here would be `blocksMe`, and it
 * is the exact thing this feature exists to withhold: a caller who can read it
 * knows the moment they are blocked, which is the alt-account signal. It is not
 * a field this route omits for now — it is a field that must never be added.
 *
 * There are no counts either, for the same reason. A blockers count is blocksMe
 * with extra steps: watch it move and you have learned the same fact.
 *
 * The user is looked up first so an unknown id is a 404 rather than a confident
 * `false` — a client cannot otherwise tell "no such user" from "not blocked", and
 * those want different UI. Same reasoning as getFollowSummary.
 *
 * Self is allowed here and answers false. It is the WRITE side where a self-edge
 * is a 400; asking whether you have blocked yourself is a harmless question with
 * a permanently correct answer.
 */
export const getBlockStatus = async (targetUserId, viewerId) => {
  await getUserById(targetUserId);

  const block = await blockRepo.findBlock(viewerId, targetUserId);

  return {
    userId: targetUserId,
    blockedByMe: Boolean(block),
  };
};

/**
 * The caller's own block list, and the ONLY uncapped read of this table.
 *
 * Note what this does NOT have: a listBlocksByUser(targetUserId) twin. Every
 * other list service in this API has one — listFollowersByUser beside
 * listMyFollowers, listLikesByUser beside listMyLikes — because those lists are
 * public. This one has no twin because there is no such thing as reading somebody
 * else's block list, and the missing function IS the enforcement.
 *
 * For the same reason it needs no getUserById existence check: the caller's own
 * token already proves the row exists.
 *
 * Not paginated, matching listFollowersByUser and listLikesByPost. Every
 * unpaginated list in this API shares that ceiling, and a block list is the least
 * likely of them to reach it — but GET /all below is the paginated door for
 * anyone whose list has grown.
 */
export const listMyBlocks = async (userId) => {
  return blockRepo.findBlocksByBlocker(userId);
};

/**
 * One page of the caller's own blocks.
 *
 * Backs GET /api/blocks/all, which is the one route in this router whose path
 * means something different from its namesake elsewhere: in the other five
 * routers /all is every row in the system, here it is the caller's own rows. See
 * the authorisation note at the top of this file for why a global block list is
 * not on offer.
 *
 * userId is always the caller's own id from the access token. It is passed
 * through to the repository as blockerId, which is the WHERE clause on both the
 * page and its count.
 *
 * Returns the { items, total, page, limit } shape listAllFollows and listUsers
 * return, so the controller's envelope is the same one every paginated route in
 * this API uses.
 */
export const listMyBlocksPage = async ({ userId, page, limit }) => {
  const [items, total] = await blockRepo.findBlocksPageByBlocker({
    blockerId: userId,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/**
 * "Unblock everyone". No ownership check, and none is needed: userId is always
 * the caller's own id from the access token, so the WHERE clause IS the
 * authorisation. The route must never accept a target id from the path or body —
 * there is no admin role in this codebase, so a caller-supplied id here would let
 * anyone empty anyone else's block list.
 *
 * Note what this does NOT do: it removes the blocks the caller SET, never the
 * ones pointing at them. "Unblock everyone" and "make everyone unblock me" are
 * different operations, and only the first is one the caller owns — the second
 * does not exist at any layer.
 *
 * No read-before-delete, which is where this diverges from deleteMyFollows. That
 * function reads its targets first because each unfollowed user's own lists go
 * stale; here the one-ended counter documented on invalidateBlock means there are
 * no counterparties to invalidate. Nobody else's readable surface contains these
 * rows.
 *
 * The follow edges these blocks severed are NOT restored, for the reason
 * severFollowEdges gives.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyBlocks = async (userId) => {
  const result = await blockRepo.deleteBlocksByBlocker(userId);

  // Nothing was deleted, so nothing is stale. Saves a round trip on the repeat
  // call this idempotent route is designed to tolerate.
  if (result.count === 0) return result;

  await invalidateBlock(userId);

  return result;
};
