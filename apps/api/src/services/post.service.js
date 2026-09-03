import * as postRepo from "../repositories/post.repository.js";
import * as sessionRepo from "../repositories/session.repository.js";
import * as routineRepo from "../repositories/studyRoutine.repository.js";
// The only sanctioned way to reach prisma.user from here: user.service.js
// declares itself the sole module in apps/api that touches that table, so its
// column allowlist cannot be bypassed by accident. It also already throws the
// 404 we want, so the existence check below costs nothing extra.
import { getUserById } from "./user.service.js";

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

// throws unless the post exists AND belongs to requesterId — every function
// that reads or mutates a single post should route through this first
const getOwnedPostOrThrow = async (postId, requesterId) => {
  const post = await postRepo.findPostById(postId);
  if (!post) throw notFound("Post");
  if (post.userId !== requesterId) throw forbidden("post");
  return post;
};

/**
 * Both foreign keys are checked BEFORE the insert, for two reasons.
 *
 * Security: without the ownership half, a caller could publish a post against
 * a stranger's sessionId or routineId — attaching their content to someone
 * else's study history.
 *
 * Error quality: without the existence half, a bad id reaches Postgres and
 * comes back as a Prisma P2003 foreign-key violation, which nothing in the
 * error middleware translates — the client would get a 500 for what is plainly
 * a bad request.
 */
const assertOwnsSessionAndRoutine = async (sessionId, routineId, requesterId) => {
  const [session, routine] = await Promise.all([
    sessionRepo.findSessionById(sessionId),
    routineRepo.findRoutineById(routineId),
  ]);

  if (!session) throw notFound("Session");
  if (session.userId !== requesterId) throw forbidden("session");

  if (!routine) throw notFound("Routine");
  if (routine.userId !== requesterId) throw forbidden("routine");
};

export const createPost = async ({ userId, sessionId, routineId, caption, photoUrl }) => {
  await assertOwnsSessionAndRoutine(sessionId, routineId, userId);
  return postRepo.createPost({ userId, sessionId, routineId, caption, photoUrl });
};

export const getPost = async (postId, requesterId) => {
  return getOwnedPostOrThrow(postId, requesterId);
};

export const listMyPosts = async (userId) => {
  return postRepo.findPostsByUser(userId);
};

/**
 * Every post by one user — the profile feed.
 *
 * Deliberately has NO ownership gate: any authenticated caller may read any
 * user's posts. That is the whole point of the route, and the reason it is a
 * separate function rather than a parameter on listMyPosts, where a caller
 * passing the wrong id would silently become an access-control hole.
 *
 * The user is looked up first so that an unknown id is a 404 rather than an
 * empty array — a client cannot otherwise tell "no such person" from "this
 * person has posted nothing", and those want different UI.
 */
export const listPostsByUser = async (targetUserId) => {
  await getUserById(targetUserId);
  return postRepo.findPostsByUser(targetUserId);
};

/**
 * Deletes every post belonging to one user — "clear my history".
 *
 * No getOwnedPostOrThrow, and none is needed: userId is always the caller's own
 * id taken from the access token, so the WHERE clause IS the authorisation.
 * The route must never accept a target id from the path or body — there is no
 * admin role in this codebase, so a caller-supplied id here would let anyone
 * wipe anyone else's feed.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyPosts = async (userId) => {
  return postRepo.deletePostsByUser(userId);
};

/**
 * Only caption and photoUrl are editable, and they are destructured out
 * explicitly rather than passing req.body through — same defence as
 * updateRoutine. The author, the two foreign keys and createdAt are all
 * history, and a client must not be able to rewrite them by adding keys to
 * the request body.
 *
 * An absent key stays absent (rather than becoming undefined -> null) because
 * Prisma ignores undefined fields in an update.
 */
export const updatePost = async (postId, requesterId, { caption, photoUrl }) => {
  await getOwnedPostOrThrow(postId, requesterId);
  return postRepo.updatePost(postId, { caption, photoUrl });
};

export const deletePost = async (postId, requesterId) => {
  await getOwnedPostOrThrow(postId, requesterId);
  return postRepo.deletePost(postId);
};
