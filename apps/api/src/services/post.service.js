import * as postRepo from "../repositories/post.repository.js";
import * as sessionRepo from "../repositories/session.repository.js";
import * as routineRepo from "../repositories/studyRoutine.repository.js";
// The only sanctioned way to reach prisma.user from here: user.service.js
// declares itself the sole module in apps/api that touches that table, so its
// column allowlist cannot be bypassed by accident. It also already throws the
// 404 we want, so the existence check below costs nothing extra.
import { getUserById } from "./user.service.js";
// Cross-domain reads, for cache invalidation only — see invalidatePostFanout.
// Repository rather than service imports, matching how like.service.js reaches
// for findPostById: going through the services would drag their gates along.
import { findCommenterIdsByPosts } from "../repositories/comment.repository.js";
import { findLikerIdsByPosts } from "../repositories/like.repository.js";
import {
  bumpVersions,
  postContentVersionKey,
  postAuthorVersionKey,
  userVersionKey,
  likeUserVersionKey,
} from "../utils/cache.js";

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
 * Invalidates this module's OWN cached reads.
 *
 * Lives in the service rather than the middleware for the reason invalidateLike
 * gives: this is the only layer holding both the post and the author a change
 * touched. Nothing here can fail a write — bumpVersions swallows its own Redis
 * errors, so an outage costs a bump and leaves entries stale until their TTL
 * lapses rather than turning a successful 201 into a 500.
 *
 * Awaited, never fired and forgotten, so a client that reads straight back after
 * writing cannot observe the version it just invalidated.
 *
 * @param {{ postIds?: string[], authorId: string }} scope
 */
const invalidatePost = async ({ postIds = [], authorId }) => {
  await bumpVersions([
    ...postIds.map(postContentVersionKey),
    postAuthorVersionKey(authorId),
  ]);
};

/**
 * The above, PLUS the comment and like caches that embed these Post rows.
 *
 * This closes the hole utils/cache.js documents: the per-user comment and like
 * lists carry a whole Post row, so an edited caption or a deleted post leaves
 * those cached responses wrong for everyone who commented on or liked it. No
 * comment and no like was written, so nothing in those modules bumps — this is
 * the only place that can.
 *
 * The two lookups are by-post rather than per-post and take the whole id array,
 * so clearing an account with a hundred posts still costs two queries. Both run
 * in parallel, and the whole fan-out is a single bumpVersions call so its Set
 * de-duplicates a user who both commented and liked.
 *
 * Only for UPDATE and DELETE. A brand new post has no comments or likes yet, so
 * createPost deliberately calls the cheaper invalidatePost instead.
 *
 * @param {string[]} postIds
 * @param {string} authorId
 */
const invalidatePostFanout = async (postIds, authorId) => {
  if (postIds.length === 0) return invalidatePost({ authorId });

  const [commenters, likers] = await Promise.all([
    findCommenterIdsByPosts(postIds),
    findLikerIdsByPosts(postIds),
  ]);

  await bumpVersions([
    ...postIds.map(postContentVersionKey),
    postAuthorVersionKey(authorId),
    ...commenters.map(({ userId }) => userVersionKey(userId)),
    ...likers.map(({ userId }) => likeUserVersionKey(userId)),
  ]);
};

/**
 * Invalidates posts whose link was severed by a DATABASE-level write.
 *
 * sessions.id and study_routines.id are ON DELETE SET NULL from posts, so
 * deleting either nulls posts.sessionId / posts.routineId inside Postgres
 * without any code here running. Nothing else in this module can see that
 * happen, so session.service.js and studyRoutine.service.js call this after
 * their own deletes — the one invalidation this API cannot infer from its own
 * write path.
 *
 * Exported rather than inlined at those two call sites so the post cache keys
 * stay owned by the post domain: a caller that composed them itself would be a
 * second place to get the format wrong, and a key format that drifts does not
 * fail loudly, it quietly stops invalidating.
 *
 * @param {Array<{ id: string, userId: string }>} posts - read BEFORE the delete
 */
export const invalidateDetachedPosts = async (posts) => {
  if (posts.length === 0) return;

  await bumpVersions([
    ...posts.map((post) => postContentVersionKey(post.id)),
    ...posts.map((post) => postAuthorVersionKey(post.userId)),
  ]);
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

  const post = await postRepo.createPost({
    userId,
    // Explicit null rather than undefined, matching createRoutine's
    // `sourceRoutineId ?? null` — the column is nullable and the intent is
    // "no link", not "field omitted".
    sessionId: sessionId ?? null,
    routineId: routineId ?? null,
    caption,
    photoUrl,
  });

  // Author list only. The post is new, so nothing can be cached under its own
  // id yet, and no comment or like can reference it — the fan-out would be
  // two guaranteed-empty queries.
  await invalidatePost({ authorId: userId });

  return post;
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
  // Read the targets BEFORE the delete. Afterwards the rows are gone and there
  // is no way left to work out which caches just went stale — deleteMyLikes
  // does exactly this, for exactly this reason.
  const targets = await postRepo.findPostIdsByUser(userId);

  const result = await postRepo.deletePostsByUser(userId);

  // One fan-out for the whole batch rather than one per post: the two lookups
  // take the full id array, so clearing a hundred posts is still two queries.
  await invalidatePostFanout(
    targets.map((target) => target.id),
    userId,
  );

  return result;
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

  const post = await postRepo.updatePost(postId, {
    caption,
    photoUrl,
    sessionId,
    routineId,
  });

  // AFTER the write resolves, never before or concurrently — bumping first lets
  // a reader observe the new version, query the not-yet-committed row, and cache
  // the OLD body under the NEW key, where it would sit for the full TTL.
  await invalidatePostFanout([postId], requesterId);

  return post;
};

export const deletePost = async (postId, requesterId) => {
  await getOwnedPostOrThrow(postId, requesterId);

  const result = await postRepo.deletePost(postId);
  await invalidatePostFanout([postId], requesterId);

  return result;
};
