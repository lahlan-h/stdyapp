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
 * A link is checked BEFORE it is written, for two reasons.
 *
 * Security: without the ownership half, a caller could attach their post to a
 * stranger's session or routine — hanging their content off someone else's
 * study history.
 *
 * Error quality: without the existence half, a bad id reaches Postgres and
 * comes back as a Prisma P2003 foreign-key violation, which nothing in the
 * error middleware translates — the client would get a 500 for what is plainly
 * a bad request.
 *
 * Separate functions per link, rather than one that takes both: the two ids now
 * travel independently. A create may supply either, both or neither, and an
 * update may set just one.
 */
const assertOwnsSession = async (sessionId, requesterId) => {
  const session = await sessionRepo.findSessionById(sessionId);
  if (!session) throw notFound("Session");
  if (session.userId !== requesterId) throw forbidden("session");
};

const assertOwnsRoutine = async (routineId, requesterId) => {
  const routine = await routineRepo.findRoutineById(routineId);
  if (!routine) throw notFound("Routine");
  if (routine.userId !== requesterId) throw forbidden("routine");
};

/**
 * Both links are optional — a post can be a plain photo and caption, tied to a
 * session, tied to a routine, or both. Only the ids actually supplied are
 * checked, and they are checked in parallel so supplying both still costs one
 * round trip's latency rather than two.
 */
export const createPost = async ({ userId, sessionId, routineId, caption, photoUrl }) => {
  const checks = [];
  if (sessionId) checks.push(assertOwnsSession(sessionId, userId));
  if (routineId) checks.push(assertOwnsRoutine(routineId, userId));
  await Promise.all(checks);

  return postRepo.createPost({
    userId,
    // Explicit null rather than undefined, matching createRoutine's
    // `sourceRoutineId ?? null` — the column is nullable and the intent is
    // "no link", not "field omitted".
    sessionId: sessionId ?? null,
    routineId: routineId ?? null,
    caption,
    photoUrl,
  });
};

export const getPost = async (postId, requesterId) => {
  return getOwnedPostOrThrow(postId, requesterId);
};

/**
 * One page of the global feed — every post by everyone, newest first.
 *
 * Deliberately has NO ownership gate, for the same reason listPostsByUser has
 * none: this IS the feed, and gating it on authorship would leave it showing
 * only your own posts. Authentication is still required, at the router.
 *
 * Returns the { items, total, page, limit } shape listUsers returns, so the
 * controller can build the pagination envelope the same way.
 */
export const listAllPosts = async ({ page, limit }) => {
  const [items, total] = await postRepo.findAllPosts({
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
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
 * Editable: caption, photoUrl, and the two links. The author and createdAt are
 * history and stay unwritable — the fields are destructured out explicitly
 * rather than passing req.body through, the same defence updateRoutine uses, so
 * extra keys in the body cannot reach the database.
 *
 * The links are THREE-STATE, which works because JSON and Prisma happen to
 * agree on what undefined and null mean:
 *
 *   key absent (undefined) -> leave as-is   (Prisma skips undefined fields)
 *   "sessionId": "abc-123" -> attach        (checked first)
 *   "sessionId": null      -> detach        (Prisma writes NULL)
 *
 * Only a non-null value needs a permission check: undefined points at nothing
 * and null points at nothing, so neither can attach you to someone else's row.
 */
export const updatePost = async (
  postId,
  requesterId,
  { caption, photoUrl, sessionId, routineId },
) => {
  await getOwnedPostOrThrow(postId, requesterId);

  const checks = [];
  if (sessionId) checks.push(assertOwnsSession(sessionId, requesterId));
  if (routineId) checks.push(assertOwnsRoutine(routineId, requesterId));
  await Promise.all(checks);

  return postRepo.updatePost(postId, { caption, photoUrl, sessionId, routineId });
};

export const deletePost = async (postId, requesterId) => {
  await getOwnedPostOrThrow(postId, requesterId);
  return postRepo.deletePost(postId);
};
