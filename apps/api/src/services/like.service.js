import * as likeRepo from "../repositories/like.repository.js";
// Cross-domain repository import, precedented by post.service.js reaching for
// sessionRepo and routineRepo: the existence check below needs posts, and going
// through post.service.js instead would drag its ownership gate along with it.
import { findPostById } from "../repositories/post.repository.js";
// The only sanctioned way to reach prisma.user from here — see post.service.js.
import { getUserById } from "./user.service.js";

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
 * Same reasoning as utils/prismaError.js: @prisma/client is a dependency of
 * @stdyapp/core, NOT of this package, and only resolves here because npm hoists
 * it — so its error classes are not ours to import, and we duck-type instead.
 * clientVersion is checked alongside code because a plain object with a `code`
 * property (a Node fs error, say) would otherwise match.
 *
 * toHttpError itself is deliberately not reused: it returns HttpError, which
 * belongs to the users/auth half of this API; its P2002 message would read
 * "That value is already in use" for a duplicate like; and it maps P2003 to a
 * 409 when a bad postId is plainly a 404.
 *
 * @param {any} err
 * @param {string} code
 * @returns {boolean}
 */
const isPrismaError = (err, code) =>
  err?.code === code && typeof err?.clientVersion === "string";

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
  if (existing) return { like: existing, created: false };

  try {
    const like = await likeRepo.createLike({ userId, postId });
    return { like, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const like = await likeRepo.findLikeByUserAndPost(userId, postId);
      if (like) return { like, created: false };
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
  return likeRepo.deleteLikeByUserAndPost(userId, postId);
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
  return likeRepo.deleteLikesByUser(userId);
};
