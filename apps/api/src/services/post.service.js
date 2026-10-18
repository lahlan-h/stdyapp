import * as postRepo from "../repositories/post.repository.js";
import * as sessionRepo from "../repositories/session.repository.js";
import * as routineRepo from "../repositories/studyRoutine.repository.js";
import { HttpError } from "../utils/httpError.js";
import { toViewerSession } from "./postSession.js";
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
import { findBookmarkerIdsByPosts } from "../repositories/bookmark.repository.js";
import { findReporterIdsByPosts } from "../repositories/report.repository.js";
// The feed's audiences, and who may share to a group - see feedWhere and createPost.
import { findFollowingIds } from "../repositories/follow.repository.js";
import {
  findMembership,
  findMemberGroupIds,
} from "../repositories/studyGroup.repository.js";
// Object storage for post photos. This service owns WHEN an object is written or
// reclaimed; photoStorage owns the key layout and the ownership rule that says
// which objects a caller may touch at all.
import {
  POST_PREFIX,
  verifyUploadedPhoto,
  keyFromOwnedUrl,
  deleteManyQuietly,
} from "./photoStorage.service.js";
import * as postPhotoRepo from "../repositories/postPhoto.repository.js";
import { MAX_POST_PHOTO_BYTES } from "../config/upload.js";
import {
  bumpVersions,
  postContentVersionKey,
  postAuthorVersionKey,
  userVersionKey,
  likeUserVersionKey,
  bookmarkUserVersionKey,
  reportUserVersionKey,
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
 * The above, PLUS the comment, like, bookmark and report caches that embed these
 * Post rows.
 *
 * This closes the hole utils/cache.js documents: the per-user comment, like,
 * saved and report lists each carry a Post row, so an edited caption or a deleted
 * post leaves those cached responses wrong for everyone who commented on, liked,
 * saved or reported it. No comment, no like, no bookmark and no report was
 * written, so nothing in those modules bumps — this is the only place that can.
 *
 * The four lookups are by-post rather than per-post and take the whole id array,
 * so clearing an account with a hundred posts still costs four queries. All run
 * in parallel, and the whole fan-out is a single bumpVersions call so its Set
 * de-duplicates a user who both commented and liked.
 *
 * Note the bookmark half fans out in ONE direction only, where the comment and
 * like halves are the post side of a two-sided relationship. A saved list embeds
 * bare Post rows with no user fields, so nothing on the bookmark side goes stale
 * when a USER changes — which is why collectUserVersionKeys in user.service.js
 * has no bookmark counterpart walk. See the bookmark block in utils/cache.js.
 *
 * THE REPORT HALF IS THE EXCEPTION TO THAT EXCEPTION, and the only entity here
 * that fans out both ways. A report payload embeds a reported POST's caption and
 * photos AND a reported USER's username and avatarUrl, so collectUserVersionKeys
 * DOES have a report counterpart walk where it has no bookmark one. Note also
 * that its rows key on reporterId rather than userId, which is why its map reads
 * differently from the three above it.
 *
 * Only for UPDATE and DELETE. A brand new post has no comments, likes, bookmarks
 * or reports yet, so createPost deliberately calls the cheaper invalidatePost
 * instead.
 *
 * @param {string[]} postIds
 * @param {string} authorId
 */
const invalidatePostFanout = async (postIds, authorId) => {
  await bumpVersions(await collectPostFanoutKeys(postIds, authorId));
};

/**
 * The version keys invalidatePostFanout bumps, read but not yet bumped.
 *
 * Split out for account deletion, which has to read these BEFORE its delete -
 * afterwards the comment, like, bookmark and report rows they come from are gone
 * - and bump them only once the whole account has. Exported so the key layout
 * stays owned here, for invalidateDetachedPosts' reason.
 *
 * @param {string[]} postIds
 * @param {string} authorId
 * @returns {Promise<string[]>}
 */
export const collectPostFanoutKeys = async (postIds, authorId) => {
  if (postIds.length === 0) return [postAuthorVersionKey(authorId)];

  const [commenters, likers, bookmarkers, reporters] = await Promise.all([
    findCommenterIdsByPosts(postIds),
    findLikerIdsByPosts(postIds),
    findBookmarkerIdsByPosts(postIds),
    findReporterIdsByPosts(postIds),
  ]);

  return [
    ...postIds.map(postContentVersionKey),
    postAuthorVersionKey(authorId),
    ...commenters.map(({ userId }) => userVersionKey(userId)),
    ...likers.map(({ userId }) => likeUserVersionKey(userId)),
    ...bookmarkers.map(({ userId }) => bookmarkUserVersionKey(userId)),
    ...reporters.map(({ reporterId }) => reportUserVersionKey(reporterId)),
  ];
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
/**
 * What a post must carry beyond its title.
 *
 * A post ABOUT A SESSION needs nothing more: the session is its content - the
 * time, the focus, the chart - and a photo or a caption is a bonus on top. A
 * post with no session behind it is only words and pictures, so a title alone
 * would be an empty card; it needs at least a photo or a caption.
 */
const NEEDS_PHOTO_OR_CAPTION = "A post without a session needs a photo or a caption";

/** A post must be for someone: its followers, a group, or both. */
const NEEDS_AN_AUDIENCE = "Share this post with your followers, a group, or both";

/** Whether a post's body meets the rule above. */
const hasEnoughToPost = ({ sessionId, photoCount, caption }) =>
  Boolean(sessionId) || photoCount > 0 || Boolean(caption);

/** The R2 keys behind some photo rows - null for any not in our bucket. */
const keysOf = (photos) =>
  photos.map(({ url, userId }) => keyFromOwnedUrl(url, { prefix: POST_PREFIX, ownerId: userId }));

/**
 * Creates a post from photos the app has ALREADY uploaded straight to R2.
 *
 * ORDER, and none of it is arbitrary:
 *
 *   rules  ->  link ownership  ->  find the uploads  ->  verify each in R2
 *     ->  create the post and claim the photos, in one transaction
 *
 * The cheap checks run first, so a 400 or 403 never costs a round trip to R2.
 * Verification is where the guarantees the old multipart upload got from
 * holding the bytes are re-established - see verifyUploadedPhoto. A photo that
 * fails it is deleted on the spot (row and object), since it can never be
 * used; the app is told which one, by its position.
 *
 * Photos that pass but whose post is refused for another reason stay as they
 * are: the app may retry with them, and the sweep collects them otherwise.
 *
 * @param {{ userId: string, sessionId?: string, routineId?: string,
 *           title: string, caption?: string, photoIds?: string[] }} input -
 *           photoIds from POST /api/posts/photos, in display order
 * @returns {Promise<object>} the created post
 * @throws 400 with neither a session, a photo nor a caption, or an unusable photo;
 *         403 when a link is not the caller's; 502 when R2 cannot be reached
 */
export const createPost = async ({
  userId,
  sessionId,
  routineId,
  title,
  caption,
  photoIds = [],
  shareToFollowers = true,
  groupIds = [],
}) => {
  if (!shareToFollowers && groupIds.length === 0) throw new HttpError(400, NEEDS_AN_AUDIENCE);

  // See NEEDS_PHOTO_OR_CAPTION. caption has already been trimmed and refused
  // when empty by createPostSchema, so presence is the whole test.
  if (!hasEnoughToPost({ sessionId, photoCount: photoIds.length, caption })) {
    throw new HttpError(400, NEEDS_PHOTO_OR_CAPTION);
  }

  const checks = [];
  if (sessionId) checks.push(assertOwnsSession(sessionId, userId));
  if (routineId) checks.push(assertOwnsRoutine(routineId, userId));
  // Only to groups you are in: sharing into someone else's group would put a
  // post in front of people who never let you in.
  if (groupIds.length > 0) {
    checks.push(
      findMemberGroupIds(userId, groupIds).then((mine) => {
        if (mine.length !== groupIds.length) {
          throw new HttpError(403, "You can only share to groups you're in");
        }
      }),
    );
  }
  await Promise.all(checks);

  const uploads = await postPhotoRepo.findUnattachedPhotos({ ids: photoIds, userId });
  if (uploads.length !== photoIds.length) {
    // Someone else's, already on a post, or swept after sitting too long.
    throw new HttpError(400, "A photo is no longer available - pick it again");
  }

  const byId = new Map(uploads.map((upload) => [upload.id, upload]));
  const problems = await Promise.all(
    photoIds.map((id) =>
      verifyUploadedPhoto({
        url: byId.get(id).url,
        prefix: POST_PREFIX,
        ownerId: userId,
        maxBytes: MAX_POST_PHOTO_BYTES,
      }),
    ),
  );

  const failed = photoIds.flatMap((id, index) =>
    problems[index] ? [{ id, position: index, reason: problems[index] }] : [],
  );
  if (failed.length > 0) {
    const deletedIds = await postPhotoRepo.deleteUnattachedPhotos(failed.map(({ id }) => id));
    const deleted = uploads.filter(({ id }) => deletedIds.includes(id));
    await deleteManyQuietly(
      keysOf(deleted.map(({ url }) => ({ url, userId }))),
      "failed upload verification",
    );

    const [first] = failed;
    const err = new HttpError(400, `Photo ${first.position + 1} ${first.reason}`);
    // Which ones, so the app can drop exactly those and keep the rest. Spread
    // into the error body by index.js, as joinSession's groupId is.
    err.data = { failedPhotoIds: failed.map(({ id }) => id) };
    throw err;
  }

  const post = await postRepo.createPostWithPhotos({
    userId,
    // Explicit null rather than undefined: the columns are nullable and the
    // intent is "no link" / "no caption", not "field omitted".
    sessionId: sessionId ?? null,
    routineId: routineId ?? null,
    title,
    caption: caption ?? null,
    photoIds,
    shareToFollowers,
    groupIds,
  });
  // A claim missed inside the transaction: the sweep or a concurrent post took
  // a photo between the checks above and the write. Nothing was created.
  if (!post) throw new HttpError(400, "A photo is no longer available - pick it again");

  // Author list only. The post is new, so nothing can be cached under its own
  // id yet, and no comment or like can reference it.
  await invalidatePost({ authorId: userId });

  return post;
};

export const getPost = async (postId, requesterId) => {
  return getOwnedPostOrThrow(postId, requesterId);
};

/**
 * One row as a viewer sees it, with the join shapes flattened off.
 *
 * Flattened HERE rather than shipped as it comes back. Each relation is
 * filtered to the viewer and capped at one row by its unique, so its length is
 * the whole answer - but leaving the array on the payload would put an internal
 * join shape on the wire and invite a client to read it as "the likers" or, far
 * worse, "the reporters", which it is not. Both are destructured off so neither
 * can survive the spread.
 *
 * Shared by the global feed and the per-user list so the two cannot disagree
 * about the same post: they render through one client component, and a flag
 * flattened in one but not the other reads as a bug in the screen.
 *
 * @param {string} viewerId - the caller's own id; guaranteed by requireAuth
 */
/**
 * The personal bests among a page of rows - one query, whatever the page size.
 * See findPersonalBestSessionIds.
 */
const personalBestsOf = (rows) =>
  postRepo.findPersonalBestSessionIds(
    rows.map((row) => row.sessionId).filter(Boolean),
  );

/**
 * @param {string} viewerId
 * @param {Set<string>} [personalBests] - session ids, from personalBestsOf
 */
const toViewerPost = (viewerId, personalBests = new Set()) => ({
  likes,
  reports,
  groupShares,
  ...post
}) => {
  const report = reports[0];
  // Presence is NOT the answer. A withdrawn report is still a row - the unique
  // keeps it there so the reporter can file again - and getPostReportStatus in
  // report.service.js draws the same line, so the two must agree or a feed flag
  // and the status route would disagree about the same post.
  const isReported = Boolean(report) && report.status !== "WITHDRAWN";

  return {
    ...post,
    session: toViewerSession(post.session, post.userId, {
      isPersonalBest: personalBests.has(post.sessionId),
      viewerId,
    }),
    isLiked: likes.length > 0,
    isReported,
    // Both only while the report is live. Handing back the id of a WITHDRAWN
    // row would let a client PATCH it to WITHDRAWN a second time - a write that
    // changes nothing, spends the rate limit and reads as success - and its
    // reason would have the app tell a reporter they had filed something they
    // had already taken back.
    reportId: isReported ? report.id : null,
    reportReason: isReported ? report.reason : null,
    // The third of a family: isLiked, isReported and isMine are all facts about
    // the VIEWER rather than about the post, worked out here so no client has to
    // work them out twice and disagree.
    //
    // Unlike its two siblings it discloses nothing. userId is a Post scalar and
    // user.id is already joined onto every row, so a client could derive this
    // itself the moment it knew its own id - which, today, it does not. It
    // exists so the app can WITHHOLD an action, never to grant one: fileReport
    // rejects a self-report on its own authority, and that check is what
    // actually enforces the rule.
    isMine: post.userId === viewerId,
    // Where the post went - for its author alone, who chose it and may want
    // to see it; nobody else is told which other groups saw a post. Null for
    // everyone else, and on a row read without its shares.
    sharedTo:
      post.userId === viewerId && groupShares
        ? {
            followers: post.shareToFollowers,
            groups: groupShares.map(({ group }) => group),
          }
        : null,
  };
};

/**
 * One page of the feed — every post by everyone, or only by the audience the
 * caller chose (see feedWhere), newest first unless the caller asked for
 * another order, optionally narrowed to a date window. All of it arrives
 * already validated by listAllPostsQuerySchema.
 *
 * Deliberately has NO ownership gate, for the same reason listPostsByUser has
 * none: this IS the feed, and gating it on authorship would leave it showing
 * only your own posts. Authentication is still required, at the router.
 *
 * Returns the { items, total, page, limit } shape listUsers returns, so the
 * controller can build the pagination envelope the same way.
 *
 * VIEWER-SPECIFIC, which is new, and only safe because this is the one post
 * read deliberately left UNCACHED - cache() sits on GET /:id, GET / and
 * GET /user/:userId only. So no cache key needs a viewer dimension and no
 * invalidation changes. If /all is ever cached, its key MUST carry req.user.id
 * the way postKey already does, or one caller's heart state would be replayed
 * to everyone else for the whole TTL.
 *
 * THAT WARNING NOW GUARDS TWO FACTS, AND THE SECOND IS MUCH WORSE TO LEAK. A
 * replayed heart is a cosmetic wrong answer. A replayed `isReported` would tell
 * one user that another had reported a post - the single fact this entity exists
 * to withhold, and the one the Report model's doc block calls a retaliation
 * vector. Caching this route without a viewer dimension is therefore not a
 * performance trade-off to weigh; it is a privacy bug.
 */
/**
 * Which posts an audience's feed is of, as a `where`.
 *
 *   following - you and the people you follow, and of theirs only what they
 *               shared to followers: a post they kept to a group belongs on
 *               that group's feed, not here. Your own posts are all here.
 *   group     - what was SHARED to the group, by anyone in it. Membership is
 *               the gate - a group's feed is for its members - and 403 rather
 *               than 404, because the group's existence is not a secret.
 *   everyone  - every followers-shared post from an author you may see, and
 *               your own. Never a group-only post, which is what keeps this
 *               audience from leaking them.
 */
const feedWhere = async ({ audience, groupId }, viewerId) => {
  // Shared to followers counts only from an author the viewer may see, which is
  // what keeps a private account's posts off a stranger's feed. A group's feed
  // below has no such clause: inside a group, its members see what was shared
  // to it, private author or not.
  const mineOrForFollowers = {
    OR: [
      { userId: viewerId },
      { shareToFollowers: true, user: postRepo.authorVisibleTo(viewerId) },
    ],
  };
  if (audience === "following") {
    return {
      AND: [
        { userId: { in: [viewerId, ...(await findFollowingIds(viewerId))] } },
        mineOrForFollowers,
      ],
    };
  }
  if (audience === "group") {
    if (!(await findMembership(viewerId, groupId))) throw forbidden("group");
    return { groupShares: { some: { groupId } } };
  }
  return mineOrForFollowers;
};

export const listAllPosts = async ({ page, limit, sort, from, to, audience, groupId }, viewerId) => {
  const audienceWhere = await feedWhere({ audience, groupId }, viewerId);
  const [rows, total] = await postRepo.findAllPosts(
    { skip: (page - 1) * limit, take: limit, sort, from, to, audience: audienceWhere },
    viewerId,
  );

  const personalBests = await personalBestsOf(rows);
  return { items: rows.map(toViewerPost(viewerId, personalBests)), total, page, limit };
};

export const listMyPosts = async (userId) => {
  // Both ids are the caller: these are their posts, and they are the viewer.
  const rows = await postRepo.findPostsByUser(userId, userId);
  return rows.map(toViewerPost(userId, await personalBestsOf(rows)));
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
export const listPostsByUser = async (targetUserId, viewerId) => {
  await getUserById(targetUserId);

  // targetUserId owns the rows; viewerId answers isLiked / isReported / isMine.
  // They differ whenever one user is looking at another's profile, which is the
  // whole reason this takes two ids rather than one.
  const rows = await postRepo.findPostsByUser(targetUserId, viewerId);
  return rows.map(toViewerPost(viewerId, await personalBestsOf(rows)));
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
  const targets = await postRepo.findPostRefsByUser(userId);
  // Their photos too, for the same reason: the rows cascade away with the posts
  // and the R2 objects do not.
  const photos = await postPhotoRepo.findPhotosOfPosts({ authorId: userId });

  const result = await postRepo.deletePostsByUser(userId);

  // One fan-out for the whole batch rather than one per post: the two lookups
  // take the full id array, so clearing a hundred posts is still two queries.
  await invalidatePostFanout(
    targets.map((target) => target.id),
    userId,
  );

  // Batched rather than looped - one request per 1000 keys instead of one per
  // photo. Non-ours (the seeded cdn.example.com fixtures, any third-party URL)
  // resolve to null and are dropped by deleteManyQuietly.
  await deleteManyQuietly(keysOf(photos), "posts bulk deleted");

  return result;
};

/**
 * Editable: title, caption and the two links. The author, createdAt and PHOTO are
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
  { title, caption, sessionId, routineId },
) => {
  const existing = await getOwnedPostOrThrow(postId, requesterId);

  // An edit may not leave a post that createPost would refuse: clearing the
  // caption, or unlinking the session, of a post with nothing else to show.
  // Photos are fixed at creation, so the stored rows are the whole answer.
  if (caption === null || sessionId === null) {
    const photoCount = (await postPhotoRepo.findPhotosOfPosts({ postId })).length;
    const after = {
      sessionId: sessionId === undefined ? existing.sessionId : sessionId,
      caption: caption === undefined ? existing.caption : caption,
      photoCount,
    };
    if (!hasEnoughToPost(after)) throw new HttpError(400, NEEDS_PHOTO_OR_CAPTION);
  }

  const checks = [];
  if (sessionId) checks.push(assertOwnsSession(sessionId, requesterId));
  if (routineId) checks.push(assertOwnsRoutine(routineId, requesterId));
  await Promise.all(checks);

  const post = await postRepo.updatePost(postId, {
    title,
    caption,
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
  // Read BEFORE the delete: the photo rows cascade away with the post, and
  // their urls are the only way to work out which R2 objects to reclaim.
  const photos = await postPhotoRepo.findPhotosOfPosts({ postId });

  const result = await postRepo.deletePost(postId);

  // BEFORE the object delete, not after. The bump must follow the write for the
  // reason bumpVersions documents, and it must also come before the R2 call:
  // deleting crosses the internet, and letting it delay invalidation widens
  // the window in which a live cached payload advertises an image that is
  // already gone.
  await invalidatePostFanout([postId], requesterId);

  // No reference check, unlike when posts held a bare photoUrl: every upload
  // gets its own uuid key and its own row, so no other post can point at these.
  await deleteManyQuietly(keysOf(photos), "post deleted");

  return result;
};
