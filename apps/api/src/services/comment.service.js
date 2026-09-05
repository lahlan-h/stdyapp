import * as commentRepo from "../repositories/comment.repository.js";
// Cross-domain repository import, precedented by like.service.js: the existence
// and post-owner checks below need posts, and going through post.service.js
// instead would drag getOwnedPostOrThrow along — which would make commenting on
// someone else's post a 403, i.e. break the entire feature.
import { findPostById } from "../repositories/post.repository.js";
// The only sanctioned way to reach prisma.user from here — see post.service.js.
import { getUserById } from "./user.service.js";
// The shared duck-typing helper; toHttpError from the same module is not reused,
// for the reasons spelled out in like.service.js.
import { isPrismaError } from "../utils/prismaError.js";
import {
  bumpVersions,
  postVersionKey,
  userVersionKey,
  commentVersionKey,
} from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — a hybrid of this module's two neighbours, on purpose.
 *
 * Reads are OPEN to any authenticated caller, which is like.service.js's rule: a
 * comment section is public by definition, and a thread that hid other people's
 * comments would not be a comment section.
 *
 * Writes are gated on the comment's AUTHOR, which is post.service.js's rule:
 * this is authored content, not one bit of metadata.
 *
 * DELETE additionally admits the owner of the POST — the one rule neither
 * neighbour has, and the reason this module needed a model of its own. A comment
 * section is the only place in this app where someone else's content lands on
 * your page, so its owner needs a way to take it down.
 *
 * That extension stops at delete. Editing stays author-only, and the asymmetry
 * is the point: removing someone's words is moderation, rewriting them is
 * putting words in their mouth.
 *
 * Two consequences, stated as choices rather than oversights:
 *   - Commenting on your own post is allowed, as is commenting many times. There
 *     is no unique constraint here, unlike likes — repetition is speech.
 *   - A post owner who deletes a comment leaves no tombstone. There is no
 *     moderation log in this codebase yet; when there is, this is where it hooks.
 *
 * No function here may take a target userId from the path or body for a write.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

const forbidden = (what) => {
  const err = new Error(`You don't have access to this ${what}`);
  err.status = 403;
  return err;
};

const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

/**
 * Existence only, and note what is NOT here.
 *
 * post.service.js's assertOwnsSession has a security half and an existence half.
 * This has only the existence half, and that absence is the feature: you are
 * supposed to comment on other people's posts.
 *
 * The existence half carries over verbatim, though. Without it a bad postId
 * reaches Postgres and comes back as a Prisma P2003 foreign-key violation, which
 * nothing in the error middleware translates — the client would get a 500 for
 * what is plainly a bad request.
 */
const assertPostExists = async (postId) => {
  const post = await findPostById(postId);
  if (!post) throw notFound("Post");
  return post;
};

const getCommentOrThrow = async (commentId) => {
  const comment = await commentRepo.findCommentById(commentId);
  if (!comment) throw notFound("Comment");
  return comment;
};

/**
 * The author-only gate, used by update.
 *
 * Separate from the delete gate below rather than a boolean parameter on one
 * shared function: a flag that widens an authorisation check is exactly the kind
 * of thing that gets passed the wrong way round once, silently, and never
 * noticed. Two functions cannot be miscalled.
 */
const getOwnCommentOrThrow = async (commentId, requesterId) => {
  const comment = await getCommentOrThrow(commentId);
  if (comment.userId !== requesterId) throw forbidden("comment");
  return comment;
};

/**
 * The moderation gate, used by delete: the comment's author, or the owner of the
 * post it sits on.
 *
 * The post is fetched ONLY when the cheap check fails, so the common case —
 * deleting your own comment — costs the same one query it did before moderation
 * existed, and the second query is paid for only by the rarer path.
 */
const getDeletableCommentOrThrow = async (commentId, requesterId) => {
  const comment = await getCommentOrThrow(commentId);
  if (comment.userId === requesterId) return comment;

  const post = await findPostById(comment.postId);
  // A comment whose post has vanished cannot be reached through any route (the
  // foreign key cascades), so this is defensive rather than expected — but
  // reading .userId off undefined would be a 500 where a 403 is meant.
  if (post?.userId !== requesterId) throw forbidden("comment");

  return comment;
};

/**
 * CACHE INVALIDATION — why it lives in this layer.
 *
 * The cache itself is HTTP-layer (middleware/cache.js caches whole responses),
 * but invalidation is a DATA concern: it needs to know which post's thread and
 * whose comment list a change touched, and this is the only layer holding both.
 * The controllers in this API are deliberately thin — "status codes and response
 * shape only, no policy" — and a controller would have to re-read the comment it
 * just deleted to find out.
 *
 * Nothing here can fail a write. Every helper in utils/cache.js swallows its own
 * Redis errors, so an outage costs a bump and leaves entries stale until their
 * TTL lapses; it never turns a successful 201 into a 500.
 *
 * It is awaited rather than fired and forgotten, so a client that reads straight
 * back after writing cannot observe the version it just invalidated.
 *
 * @param {{ id: string, postId: string, userId: string }} comment
 */
const invalidateComment = async (comment) => {
  await bumpVersions([
    // The thread and the per-viewer summary both hang off the post.
    postVersionKey(comment.postId),
    // The author's own list. Taken from the COMMENT, never from the requester —
    // see deleteComment for why that distinction is the trap in this module.
    userVersionKey(comment.userId),
    // The single-comment read. A separate counter because GET /:id knows only
    // the id: its postId and author are exactly what a cached read must avoid
    // going to the database to discover. A no-op on create, where nothing can
    // yet be cached under a brand-new id, and kept anyway so all three
    // single-comment writes invalidate identically.
    commentVersionKey(comment.id),
  ]);
};

/**
 * Leaves a comment on a post.
 *
 * Deliberately NOT idempotent, which is the opposite of likePost and follows
 * straight from the schema: likes carry a @@unique([userId, postId]) because a
 * second tap of the same heart is a duplicate, while a second comment is a
 * second thing to say. A double-submitted form therefore produces two comments
 * here, and the client is the right place to prevent that — the server cannot
 * tell an accidental resubmit from someone genuinely saying "this" twice.
 */
export const createComment = async ({ userId, postId, body }) => {
  await assertPostExists(postId);

  let comment;
  try {
    comment = await commentRepo.createComment({ userId, postId, body });
  } catch (err) {
    // The post was deleted between the check above and this insert. The check
    // was honest when it ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) throw notFound("Post");
    throw err;
  }

  await invalidateComment(comment);
  return comment;
};

/**
 * Open read, per the authorisation note at the top: any authenticated caller may
 * read any comment. Contrast getPost, which gates on ownership — a post is
 * fetched by its author, a comment is fetched by everyone reading the thread.
 *
 * Uses the author-joined finder, not the bare one the gates above use: this is
 * the one path here that hands a comment straight to a client, and a comment
 * without its author's name and avatar cannot be rendered.
 */
export const getComment = async (commentId) => {
  const comment = await commentRepo.findCommentWithAuthorById(commentId);
  if (!comment) throw notFound("Comment");
  return comment;
};

/**
 * One post's whole comment thread.
 *
 * The post is looked up first so an unknown id is a 404 rather than an empty
 * array — a client cannot otherwise tell "no such post" from "nobody has
 * commented yet", and those want different UI. Same reasoning as
 * listLikesByPost.
 *
 * Not paginated, matching listLikesByPost and listPostsByUser. Every unpaginated
 * list in this API shares that ceiling, and a thread is the one most likely to
 * reach it first; @@index([postId, createdAt]) is what makes adding a cursor
 * here cheap when it does.
 */
export const listCommentsByPost = async (postId) => {
  await assertPostExists(postId);
  return commentRepo.findCommentsByPost(postId);
};

/**
 * Everything a comment icon needs, in one round trip — mirroring getLikeSummary.
 *
 * Returning the count alone would be half an answer for a client that wants to
 * highlight threads you are part of, and would guarantee a second call for it.
 * Both queries are served by indexes on comments.
 */
export const getCommentSummary = async (postId, userId) => {
  await assertPostExists(postId);

  const [count, mine] = await Promise.all([
    commentRepo.countCommentsByPost(postId),
    commentRepo.findFirstCommentByUserAndPost(userId, postId),
  ]);

  return { postId, count, commentedByMe: Boolean(mine) };
};

export const listMyComments = async (userId) => {
  return commentRepo.findCommentsByUser(userId);
};

/**
 * Every comment one user has left — their "comments" tab.
 *
 * A separate function rather than a parameter on listMyComments, exactly as
 * listPostsByUser is separate from listMyPosts: a caller passing the wrong id
 * into a combined function would silently become an access-control hole.
 *
 * The user is looked up first so an unknown id is a 404 rather than an empty
 * array. Worth flagging that a full comment history is privacy-sensitive; it is
 * open because it mirrors listPostsByUser, and this app has no privacy model at
 * all yet.
 */
export const listCommentsByUser = async (targetUserId) => {
  await getUserById(targetUserId);
  return commentRepo.findCommentsByUser(targetUserId);
};

/**
 * One page of every comment in the system.
 *
 * No ownership gate, consistent with the authorisation note at the top: comments
 * are public social data, and only WRITES are scoped to the token holder.
 * Authentication is still required, at the router.
 *
 * Returns the { items, total, page, limit } shape listUsers returns, so the
 * controller can build the pagination envelope the same way.
 */
export const listAllComments = async ({ page, limit }) => {
  const [items, total] = await commentRepo.findAllComments({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/**
 * Author-only, and only the body is writable.
 *
 * The author, the post it hangs off and createdAt are all history: re-pointing a
 * comment at a different post would move someone's words into a thread they
 * never saw. The field is destructured out explicitly rather than passing
 * req.body through — the same defence updatePost uses, so extra keys in the body
 * cannot reach the database.
 *
 * updatedAt is set by Prisma's @updatedAt, which is what lets a client render an
 * "edited" marker by comparing it against createdAt.
 */
export const updateComment = async (commentId, requesterId, { body }) => {
  // The gate's return value is captured rather than discarded: it carries the
  // postId and author this comment belongs to, which is exactly what
  // invalidation needs and what a second read would otherwise have to fetch.
  const existing = await getOwnCommentOrThrow(commentId, requesterId);

  const comment = await commentRepo.updateComment(commentId, { body });
  await invalidateComment(existing);

  return comment;
};

/**
 * Author OR post owner — see getDeletableCommentOrThrow.
 *
 * The invalidation here is the one genuinely easy thing to get wrong in this
 * module. A post owner may delete SOMEONE ELSE'S comment, so requesterId and
 * comment.userId are different people on that path. Bumping the requester would
 * invalidate the moderator's own comment list — which did not change — and
 * leave the actual author's list serving a comment that no longer exists, until
 * its TTL lapsed. invalidateComment reads the author off the comment for
 * exactly this reason.
 */
export const deleteComment = async (commentId, requesterId) => {
  const comment = await getDeletableCommentOrThrow(commentId, requesterId);

  const deleted = await commentRepo.deleteComment(commentId);
  await invalidateComment(comment);

  return deleted;
};

/**
 * "Clear my comments". No ownership check, and none is possible: userId is
 * always the caller's own id from the access token, so the WHERE clause IS the
 * authorisation. The route must never accept a target id from the path or
 * body — there is no admin role in this codebase, so a caller-supplied id here
 * would let anyone wipe anyone else's comments.
 *
 * This is also the escape hatch for the Restrict on comments.userId: a user
 * cannot be deleted while their comments exist, and this is how they stop
 * existing. The same relationship deleteMyPosts has with posts.userId.
 *
 * Invalidation is the expensive half here, and it is why the targets are read
 * FIRST. This one call empties the caller's comment list AND changes every
 * thread they had commented on — which may be hundreds of different posts — and
 * once deleteCommentsByUser has run there is nothing left in the database to
 * work out which ones those were. One extra indexed read on
 * comments_userId_createdAt_idx buys that answer, on an operation that is rare,
 * destructive, and already the most expensive write in the module.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyComments = async (userId) => {
  const targets = await commentRepo.findCommentTargetsByUser(userId);

  const result = await commentRepo.deleteCommentsByUser(userId);

  // Nothing was deleted, so nothing is stale. Saves a round trip on the repeat
  // call this idempotent route is designed to tolerate.
  if (result.count === 0) return result;

  // bumpVersions de-duplicates, which matters here: several comments on the
  // same post is the normal case, and each would otherwise bump that post's
  // counter separately for no additional effect. It also chunks its pipeline,
  // so a heavy account never becomes one enormous command.
  await bumpVersions([
    userVersionKey(userId),
    ...targets.map((target) => postVersionKey(target.postId)),
    // Every one of these comments is now a 404, so a cached single-comment
    // response for it would not merely be stale but WRONG.
    ...targets.map((target) => commentVersionKey(target.id)),
  ]);

  return result;
};
