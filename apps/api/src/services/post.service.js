import * as postRepo from "../repositories/post.repository.js";
import * as sessionRepo from "../repositories/session.repository.js";
import * as routineRepo from "../repositories/studyRoutine.repository.js";

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
