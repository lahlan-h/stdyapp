import * as likeRepo from "../repositories/like.repository.js";
// Cross-domain repository import, precedented by post.service.js reaching for
// sessionRepo and routineRepo: the existence check below needs posts, and going
// through post.service.js instead would drag its ownership gate along with it.
import { findPostById } from "../repositories/post.repository.js";
// The only sanctioned way to reach prisma.user from here — see post.service.js.
import { getUserById } from "./user.service.js";
// The shared duck-typing helper. toHttpError from the same module is
// deliberately NOT reused: it returns HttpError, which belongs to the
// users/auth half of this API; its P2002 message would read "That value is
// already in use" for a duplicate like; and it maps P2003 to a 409 when a bad
// postId is plainly a 404.
import { isPrismaError } from "../utils/prismaError.js";
import {
  bumpVersions,
  likePostVersionKey,
  likeUserVersionKey,
} from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — deliberately NOT post.service.js's.
 *
 * post.service.js applies one rule everywhere via getOwnedPostOrThrow: read the
 * row, then check you own it. That rule is wrong here, because the entire point
 * of a like is that you leave it on SOMEONE ELSE'S post.
 *
 * Instead: ownership of the LIKE governs writes, and nothing governs reads
 * beyond authentication. Every write is scoped by "userId = the id on the
 * access token", so the WHERE clause IS the authorisation — which is why there
 * is no forbidden() helper in this module and no ownership check after a read.
 * Reads are open because a like is public social data by definition; the
 * "liked by" list on a post already shows everyone's, so gating a single like
 * on ownership would make the API contradict itself.
 *
 * The consequences, stated as choices rather than oversights:
 *   - Self-liking is allowed. Blocking it invents a 403 that every client must
 *     handle, for no product value.
 *   - A post's author may NOT delete likes on their post. Only the liker
 *     unlikes.
 *
 * No function here may take a target userId from the path or body for a write.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Existence only — note what is NOT here.
 *
 * post.service.js's assertOwnsSessionAndRoutine has two halves, a security one
 * and an existence one. This has only the existence half, and that absence is
 * the feature: you are supposed to like other people's posts.
 *
 * The existence half carries over verbatim, though. Without it a bad postId
 * reaches Postgres and comes back as a Prisma P2003 foreign-key violation,
 * which nothing in the error middleware translates — the client would get a
 * 500 for what is plainly a bad request.
 */
const assertPostExists = async (postId) => {
  const post = await findPostById(postId);
  if (!post) throw notFound("Post");
  return post;
};

/**
 * Invalidates every cached read a like write can affect.
 *
 * Lives in the service rather than the middleware for the reason
 * invalidateComment gives: this is the only layer that holds both the post and
 * the user a change touched. The controllers here are deliberately thin.
 *
 * Nothing here can fail a write. bumpVersions swallows its own Redis errors, so
 * an outage costs a bump and leaves entries stale until their TTL lapses; it
 * never turns a successful 201 into a 500.
 *
 * Awaited rather than fired and forgotten, so a client that reads straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {{ postId: string, userId: string }} like
 */
const invalidateLike = async ({ postId, userId }) => {
  await bumpVersions([
    // The liked-by list and the per-viewer summary both hang off the post.
    likePostVersionKey(postId),
    // The liker's own list, shared by GET / and GET /user/:userId.
    likeUserVersionKey(userId),
  ]);
};

/**
 * Likes a post, idempotently.
 *
 * A repeat like is NOT a 409. joinGroup throws conflict("Already a member of
 * this group") because joining is a considered, one-shot action taken with a
 * join code, where a conflict is real information. A like is a TAP, fired
 * optimistically by a client that has already turned the heart red locally — it
 * arrives twice from a double-tap, from a retry on a flaky mobile connection,
 * and from an app resumed with stale state. A 409 would force every client to
 * write "if 409, treat as success": a branch that exists only to undo the API's
 * unhelpfulness, and one some client will forget, leaving a grey heart.
 *
 * The distinction is still preserved where it is free — `created` lets the
 * controller answer 201 or 200 without the caller having to care.
 *
 * @returns {Promise<{ like: object, created: boolean }>}
 */
export const likePost = async ({ userId, postId }) => {
  await assertPostExists(postId);

  const existing = await likeRepo.findLikeByUserAndPost(userId, postId);
  // Nothing changed, so nothing to invalidate — the cheap path stays cheap.
  if (existing) return { like: existing, created: false };

  try {
    const like = await likeRepo.createLike({ userId, postId });
    await invalidateLike(like);
    return { like, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const like = await likeRepo.findLikeByUserAndPost(userId, postId);
      // Bumped even though `created` is false. Unlike the early return above,
      // a row genuinely WAS inserted here — by the request that won the race.
      // Its own bump covers this, but bumping twice only orphans a key, while
      // missing one serves a stale heart for the whole TTL.
      if (like) {
        await invalidateLike(like);
        return { like, created: false };
      }
    }
    // The post was deleted inside that same window. The check above was honest
    // when it ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) throw notFound("Post");
    throw err;
  }
};

/**
 * The mirror of likePost's idempotency: unliking something you never liked is
 * not an error, it is the state you asked for. deleteMany does not throw on a
 * miss, so no 404 is possible here.
 *
 * userId is always the caller's own id from the access token — that WHERE
 * clause is the entire authorisation, which is why this needs no ownership
 * check and must never accept a caller-supplied userId.
 *
 * @returns {Promise<{ count: number }>}
 */
export const unlikePost = async (postId, userId) => {
  const result = await likeRepo.deleteLikeByUserAndPost(userId, postId);

  // Only when a row actually went. deleteMany reports count 0 for the "unlike
  // something you never liked" case, which changed nothing and must not spend a
  // bump — this route is a toggle clients fire freely.
  if (result.count > 0) await invalidateLike({ postId, userId });

  return result;
};

/**
 * Everything a heart needs, in one round trip.
 *
 * Returning the count alone would be half an answer — a client cannot render a
 * heart without knowing whether it is filled — and would guarantee a second
 * call for likedByMe. Both queries are served by indexes on likes, so the pair
 * costs about what the count alone would.
 */
export const getLikeSummary = async (postId, userId) => {
  await assertPostExists(postId);

  const [count, mine] = await Promise.all([
    likeRepo.countLikesByPost(postId),
    likeRepo.findLikeByUserAndPost(userId, postId),
  ]);

  return { postId, count, likedByMe: Boolean(mine) };
};

// The post is looked up first so an unknown id is a 404 rather than an empty
// array — a client cannot otherwise tell "no such post" from "nobody has liked
// it", and those want different UI. Same reasoning as listPostsByUser.
export const listLikesByPost = async (postId) => {
  await assertPostExists(postId);
  return likeRepo.findLikesByPost(postId);
};

/**
 * One page of every like in the system.
 *
 * No ownership gate, consistent with the authorisation note at the top of this
 * module: likes are public social data, and only WRITES are scoped to the token
 * holder. Authentication is still required, at the router.
 *
 * Returns the { items, total, page, limit } shape listUsers returns.
 */
export const listAllLikes = async ({ page, limit }) => {
  const [items, total] = await likeRepo.findAllLikes({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

export const listMyLikes = async (userId) => {
  return likeRepo.findLikesByUser(userId);
};

/**
 * Every like one user has left — their "liked" tab.
 *
 * Deliberately has NO ownership gate, exactly like listPostsByUser: any
 * authenticated caller may read any user's likes. It is a separate function
 * rather than a parameter on listMyLikes so that a caller passing the wrong id
 * cannot silently become an access-control hole.
 *
 * Worth flagging: a full like history is the most privacy-sensitive surface in
 * this module. It is open because it mirrors listPostsByUser and this app has
 * no privacy model at all yet; making it self-only later is one check in the
 * controller.
 */
export const listLikesByUser = async (targetUserId) => {
  await getUserById(targetUserId);
  return likeRepo.findLikesByUser(targetUserId);
};

/**
 * "Clear my likes". No ownership check, and none is needed: userId is always
 * the caller's own id from the access token, so the WHERE clause IS the
 * authorisation. The route must never accept a target id from the path or
 * body — there is no admin role in this codebase, so a caller-supplied id here
 * would let anyone wipe anyone else's likes.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyLikes = async (userId) => {
  // Read the targets BEFORE the delete. Afterwards the rows are gone and there
  // is no way left to work out which posts' like counts just went stale.
  const targets = await likeRepo.findLikeTargetsByUser(userId);

  const result = await likeRepo.deleteLikesByUser(userId);

  // One counter per post touched, plus the caller's own list. bumpVersions
  // de-duplicates and chunks its pipeline, so a heavy account clearing hundreds
  // of likes is a handful of round trips rather than one per row.
  await bumpVersions([
    ...targets.map((target) => likePostVersionKey(target.postId)),
    likeUserVersionKey(userId),
  ]);

  return result;
};
