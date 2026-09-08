import { getRedis, createLogger } from "@stdyapp/core";

/**
 * The fail-open boundary between this API and Redis.
 *
 * EVERY Redis call in apps/api goes through this module, and that is the point
 * of it existing: packages/core/src/redis.js configures the client with
 * enableOfflineQueue:false, maxRetriesPerRequest:1 and commandTimeout:1000, so
 * every command REJECTS while Redis is down instead of buffering. Express 4
 * does not catch rejections from async middleware, so an uncaught one does not
 * produce a 500 — it HANGS the request until the client gives up.
 *
 * Concentrating the error handling here means that discipline is enforced once
 * rather than re-derived correctly at a dozen call sites. Nothing exported from
 * this file ever throws: a failure is reported as a miss, and the caller falls
 * through to Postgres.
 *
 * Cache state is therefore NEVER load-bearing for correctness of the API. Redis
 * being empty, stale, corrupt or entirely absent must only ever cost latency.
 */

const log = createLogger("cache");

// Version counters: bumping one orphans every key stamped with the old value.
const VERSION_PREFIX = "v:";

/**
 * Payload keys carry a schema epoch. Bump it when a cached response SHAPE
 * changes and every key from the old shape is orphaned at once — far cheaper
 * and safer than trying to hunt down and purge the old ones.
 */
const EPOCH = "c1";

/**
 * The same idea for likes, versioned independently. A change to the like
 * response shape must not orphan every cached comment, and vice versa.
 */
const LIKE_EPOCH = "l1";

/**
 * And again for posts. Three independent epochs means changing the post
 * response shape orphans no comment or like payload, and vice versa.
 */
const POST_EPOCH = "p1";

/**
 * And once more for users. Same reasoning a fourth time: the profile payload is
 * a USER_PUBLIC_SELECT row from user.service.js, and changing that allowlist
 * must orphan every cached profile without touching a comment, like or post.
 */
const USER_EPOCH = "u1";

/**
 * And a fifth time for follows. The follower and following payloads embed a
 * {id, username, avatarUrl} row per counterparty, and changing that shape must
 * orphan every cached follow list without touching a comment, like, post or
 * profile.
 */
const FOLLOW_EPOCH = "f1";

/**
 * And three more, one each for the routers that predate this cache. Same
 * reasoning an eighth, ninth and tenth time - a session payload embeds its
 * interruptions, a group payload embeds a membership COUNT and a routine
 * payload embeds its todo items, so each of those shapes must be free to change
 * and orphan only its own keys.
 */
const SESSION_EPOCH = "se1";
const GROUP_EPOCH = "g1";
const ROUTINE_EPOCH = "r1";

/**
 * And four more, for the gamification and account entities. Same reasoning an
 * eleventh through fourteenth time - a goal-progress payload embeds a computed
 * total, a streak payload embeds an EFFECTIVE count rather than the stored one,
 * a subscription payload embeds a derived isPremium flag and a notification
 * payload is a bare count. Each of those shapes must be free to change and
 * orphan only its own keys.
 */
const GOAL_EPOCH = "go1";
const STREAK_EPOCH = "st1";
const SUBSCRIPTION_EPOCH = "sb1";
const NOTIFICATION_EPOCH = "nt1";

/**
 * Version counters outlive the payloads beneath them by a wide margin, and that
 * gap is deliberate.
 *
 * A counter that vanishes resets to 0, which would RESURRECT any payload still
 * cached under version 0 — serving data that was invalidated. Payload TTLs are
 * seconds to minutes (config/cache.js), so seven days guarantees the payloads
 * are long gone before their counter can disappear.
 *
 * Persisting them forever looks safer but is not: under an allkeys-lru
 * maxmemory-policy Redis may evict a counter at any moment. docker-compose.yml
 * sets no maxmemory today, so eviction is off — this guards the day it is not.
 */
const VERSION_TTL_SEC = 7 * 24 * 60 * 60;

/**
 * One pipeline is one round trip, so a huge one is a single command that blocks
 * the Redis event loop for as long as it takes to run — and must finish inside
 * the client's 1s commandTimeout. 500 keys is small enough to stay
 * imperceptible and large enough that even a heavy account cleanup is a handful
 * of round trips rather than thousands.
 */
const CHUNK_SIZE = 500;

// Not an error, but the signal that one account is pathological enough to
// explain a slow request.
const LARGE_INVALIDATION = 20000;

/**
 * Mirrors the down-transition logging in packages/core/src/redis.js: a Redis
 * outage should produce two log lines — one going down, one coming back — not
 * one per request for the duration of the outage.
 */
let isDegraded = false;

const noteFailure = (operation, err) => {
  if (isDegraded) return;
  isDegraded = true;
  log.warn(`degraded, falling through to the database: ${operation} - ${err?.message}`);
};

const noteSuccess = () => {
  if (!isDegraded) return;
  isDegraded = false;
  log.info("recovered, serving from cache again");
};

/** @param {string} postId */
export const postVersionKey = (postId) => `${VERSION_PREFIX}post:${postId}`;

/** @param {string} userId */
export const userVersionKey = (userId) => `${VERSION_PREFIX}user:${userId}`;

/** @param {string} commentId */
export const commentVersionKey = (commentId) => `${VERSION_PREFIX}comment:${commentId}`;

/**
 * The post's OWN content scope — not to be confused with postVersionKey above,
 * which despite its name is the COMMENT scope on a post (`v:post:<id>`) and is
 * bumped by comment writes.
 *
 * The literal segment is what keeps them apart: `self` and `author` are never
 * uuids, so `v:post:self:<uuid>` can never alias `v:post:<uuid>`. Renaming
 * postVersionKey to say what it means would be the better fix; it is left alone
 * here only because it is load-bearing in two other modules.
 *
 * @param {string} postId
 */
export const postContentVersionKey = (postId) =>
  `${VERSION_PREFIX}post:self:${postId}`;

/** @param {string} userId */
export const postAuthorVersionKey = (userId) =>
  `${VERSION_PREFIX}post:author:${userId}`;

/**
 * The user's OWN profile scope — and, exactly like postContentVersionKey above,
 * NOT to be confused with userVersionKey, which despite its name is the COMMENT
 * scope on a user (`v:user:<id>`) and is bumped by comment writes.
 *
 * The literal `profile` segment is what keeps them apart, the same trick and for
 * the same reason: `profile` is never a uuid, so `v:user:profile:<uuid>` can
 * never alias `v:user:<uuid>`.
 *
 * @param {string} userId
 */
export const userProfileVersionKey = (userId) =>
  `${VERSION_PREFIX}user:profile:${userId}`;

/**
 * Payload key builders.
 *
 * Centralised here rather than inlined at the two ends because a cache key is a
 * CONTRACT between the middleware that writes it and the service that
 * invalidates it. A format that drifted between those two would not fail
 * loudly — it would quietly stop invalidating.
 *
 * Every key is stamped with the version(s) it was built from, so invalidation
 * is an INCR rather than a delete. That is not merely an optimisation over
 * SCAN: it is also race-free in a way deletion is not. A reader that queries
 * the database, then has its result invalidated by a concurrent writer, writes
 * its now-stale body under the OLD version — a key nothing will ever compose
 * again. With a delete, that same reader would write stale data under the live
 * key and pin it there for the whole TTL.
 *
 * COHERENCE, and the reason the TTLs in config/cache.js are short rather than
 * generous: these payloads embed rows no comment counter tracks. The thread and
 * single-comment bodies carry the author's username and avatarUrl; the per-user
 * lists carry a whole Post row.
 *
 * The POST half of that hole is CLOSED: invalidatePostFanout in
 * post.service.js bumps userVersionKey for everyone who commented on a post
 * whenever that post is edited or deleted, so an edited caption no longer
 * lingers in a cached comment list.
 *
 * The USER half is now CLOSED TOO. invalidateUserFanout in user.service.js is
 * the mirror image, pointed the other way: a profile write bumps this user's
 * own comment list AND postVersionKey for every post they have commented on, so
 * a changed avatar or username no longer lingers in a cached thread either.
 *
 * Both halves being closed is what lets these TTLs stay a reclamation backstop
 * rather than the staleness ceiling they used to be. Any FUTURE field embedded
 * into one of these payloads from a table no counter here tracks reopens the
 * hole, and must come with the bump that closes it.
 */

/** @param {string} postId @param {number} version */
export const threadKey = (postId, version) => `${EPOCH}:cmt:post:${postId}:p${version}`;

// Includes the viewer: the summary carries commentedByMe, which differs per
// caller. It needs no user version, though — commentedByMe can only change when
// this viewer comments on this post, and every such event bumps the POST
// version already.
/** @param {string} postId @param {string} viewerId @param {number} version */
export const summaryKey = (postId, viewerId, version) =>
  `${EPOCH}:cmt:count:${postId}:${viewerId}:p${version}`;

// Stamped with a per-comment counter rather than the post/user pair, because at
// middleware time the URL carries only the comment id — its postId and author
// are unknown until something reads the row, which is the very thing the cache
// exists to avoid.
/** @param {string} commentId @param {number} version */
export const commentKey = (commentId, version) =>
  `${EPOCH}:cmt:one:${commentId}:c${version}`;

// Shared by GET / (listMine) and GET /user/:userId. Both resolve to
// findCommentsByUser(id) and return byte-identical data — listMyComments merely
// skips the existence check — so separate keys would cache the same array twice
// and halve the hit rate. If those two response shapes ever diverge, they must
// stop sharing this key.
/** @param {string} userId @param {number} version */
export const userListKey = (userId, version) =>
  `${EPOCH}:cmt:byuser:${userId}:u${version}`;

/**
 * Like key builders.
 *
 * Likes get their OWN version counters rather than reusing postVersionKey and
 * userVersionKey above, and that separation is a performance decision worth
 * stating: a like is the highest-frequency write in the app. Sharing v:post:*
 * would mean every heart tap flushed that post's whole comment thread cache —
 * gutting the comment hit rate to invalidate data no like can affect. Nothing in
 * a comment payload depends on likes, and nothing in a like payload depends on
 * comments, so the two namespaces never need to agree.
 *
 * SAME COHERENCE POSITION as the comment keys. These payloads embed rows no like
 * counter tracks: the liked-by list carries the liker's username and avatarUrl,
 * and the per-user list carries a whole Post row.
 *
 * BOTH HALVES ARE CLOSED, the same way as for comments — invalidatePostFanout
 * bumps likeUserVersionKey for everyone who liked a post when that post changes,
 * and invalidateUserFanout bumps likePostVersionKey for every post a user has
 * liked when that user's profile changes.
 */

/** @param {string} postId */
export const likePostVersionKey = (postId) => `${VERSION_PREFIX}like:post:${postId}`;

/** @param {string} userId */
export const likeUserVersionKey = (userId) => `${VERSION_PREFIX}like:user:${userId}`;

// Includes the viewer: the summary carries likedByMe, which differs per caller.
// It needs no user version, though — likedByMe can only change when THIS viewer
// likes THIS post, and every such event bumps the post counter already.
/** @param {string} postId @param {string} viewerId @param {number} version */
export const likeSummaryKey = (postId, viewerId, version) =>
  `${LIKE_EPOCH}:like:count:${postId}:${viewerId}:p${version}`;

/** @param {string} postId @param {number} version */
export const likedByKey = (postId, version) =>
  `${LIKE_EPOCH}:like:post:${postId}:p${version}`;

// Shared by GET / (listMine) and GET /user/:userId, exactly as userListKey is
// for comments. Both resolve to findLikesByUser(id) and return byte-identical
// data — listMyLikes merely skips the existence check — so separate keys would
// cache the same array twice and halve the hit rate. If those two response
// shapes ever diverge, they must stop sharing this key.
/** @param {string} userId @param {number} version */
export const likeUserListKey = (userId, version) =>
  `${LIKE_EPOCH}:like:byuser:${userId}:u${version}`;

/**
 * Follow key builders.
 *
 * ONE COUNTER PER USER, where likes and comments each need two. That is not an
 * omission — it falls out of the shape of the entity, and it is worth stating so
 * nobody "fixes" it by adding a second.
 *
 * A follow edge has a user at BOTH ends, so every event that can change any
 * follow-shaped answer about user U — someone follows U, U follows someone,
 * either direction is undone — touches a row with U on one end. Bumping
 * v:follow:user:<U> therefore invalidates U's follower list, U's following list
 * and U's summary together, which is exactly right: all three did change.
 *
 * Contrast likes, where a post and a user are different kinds of thing and a
 * like on someone else's post must not invalidate the liker's whole profile tab.
 *
 * THE COHERENCE HOLE IS CLOSED the same way it is for likes. These payloads
 * embed each counterparty's username and avatarUrl, so a renamed user is stale
 * in the follow lists of everyone they touch — collectUserVersionKeys in
 * user.service.js bumps this counter for every counterpart on a profile change,
 * via findFollowCounterpartIdsByUser.
 */

/** @param {string} userId */
export const followUserVersionKey = (userId) =>
  `${VERSION_PREFIX}follow:user:${userId}`;

// Includes the viewer: the summary carries followedByMe and followsMe, which
// both differ per caller. It needs no viewer VERSION, though — either flag can
// only change via an edge between the viewer and this user, and such an edge has
// this user on one end, so it bumps this user's counter already. Same reasoning
// as likeSummaryKey.
/** @param {string} userId @param {string} viewerId @param {number} version */
export const followSummaryKey = (userId, viewerId, version) =>
  `${FOLLOW_EPOCH}:follow:count:${userId}:${viewerId}:v${version}`;

/** @param {string} userId @param {number} version */
export const followersKey = (userId, version) =>
  `${FOLLOW_EPOCH}:follow:followers:${userId}:v${version}`;

// Shared by GET / (listMine) and GET /user/:userId/following, exactly as
// likeUserListKey is for likes. Both resolve to findFollowingByUser(id) and
// return byte-identical data — listMyFollowing merely skips the existence
// check — so separate keys would cache the same array twice and halve the hit
// rate. If those two response shapes ever diverge, they must stop sharing this
// key.
/** @param {string} userId @param {number} version */
export const followingKey = (userId, version) =>
  `${FOLLOW_EPOCH}:follow:following:${userId}:v${version}`;

/**
 * Post key builders.
 *
 * ⚠ THE VIEWER IS IN postKey, AND THAT IS A SECURITY REQUIREMENT rather than a
 * cache-shaping choice.
 *
 * Every other cached read in this file is open to any authenticated caller, so
 * its key can safely omit the viewer. GET /api/posts/:id is not: it routes
 * through getOwnedPostOrThrow and 403s for anyone but the author. Because
 * cache() runs BEFORE the controller, a viewer-less key would store the
 * author's 200 and then hand it to the next caller as a HIT — serving someone
 * else's post and never reaching the ownership check at all. Caching would
 * become an authorization bypass.
 *
 * The hit rate costs nothing: only one person can ever get a 200 from that
 * route, so the per-viewer key has exactly one occupant.
 *
 * These payloads are bare Post rows with no embedded username, avatarUrl or
 * joined data, so they have none of the coherence hole described above — every
 * field in them is covered by a counter that post.service.js bumps.
 */

/** @param {string} postId @param {string} viewerId @param {number} version */
export const postKey = (postId, viewerId, version) =>
  `${POST_EPOCH}:post:one:${postId}:${viewerId}:p${version}`;

// Shared by GET / (listMine) and GET /user/:userId, exactly as userListKey and
// likeUserListKey are. Both resolve to findPostsByUser(id) and return
// byte-identical data — listMyPosts merely skips the existence check — so
// separate keys would cache the same array twice and halve the hit rate. If
// those two response shapes ever diverge, they must stop sharing this key.
/** @param {string} userId @param {number} version */
export const postUserListKey = (userId, version) =>
  `${POST_EPOCH}:post:byuser:${userId}:u${version}`;

/**
 * User key builders.
 *
 * ⚠ THE VIEWER IS DELIBERATELY ABSENT FROM userKey, and that is the opposite
 * call to postKey directly above — so read this before "fixing" it to match.
 *
 * The rule is not "always key by viewer", it is "key by viewer exactly when the
 * route's answer depends on who is asking". GET /api/posts/:id 403s for anyone
 * but the author, so its cache MUST be per-viewer or it replays one caller's
 * post to the next. GET /api/users/:id carries no requireSelf: users.routes.js
 * states reads are open to any authenticated caller, because listUsers is a
 * searchable directory and browsing other people is the point. Every caller
 * therefore gets a byte-identical 200 from the same USER_PUBLIC_SELECT row, and
 * a per-viewer key would store one copy per reader of data that is the same for
 * all of them — collapsing the hit rate to protect nothing.
 *
 * If a future change makes any field of this response depend on the viewer, or
 * gates the route on ownership, the viewer must go into this key in the same
 * commit.
 *
 * These payloads embed no other table's rows, so they have none of the
 * coherence hole described further up: every field in them is covered by the
 * counter user.service.js bumps.
 */

/** @param {string} userId @param {number} version */
export const userKey = (userId, version) =>
  `${USER_EPOCH}:user:one:${userId}:u${version}`;

/**
 * Session version counters.
 *
 * Two scopes, matching the postContentVersionKey / postAuthorVersionKey pair:
 * one for a single session's own content, one for the owner's list of them.
 * Both carry a literal segment that can never be a uuid, so neither can alias
 * the other or anything above.
 *
 * @param {string} sessionId
 */
export const sessionContentVersionKey = (sessionId) =>
  `${VERSION_PREFIX}session:self:${sessionId}`;

/** @param {string} userId */
export const sessionOwnerVersionKey = (userId) =>
  `${VERSION_PREFIX}session:owner:${userId}`;

/**
 * Session key builders.
 *
 * ⚠ THE VIEWER IS IN sessionKey, for postKey's reason exactly - read the
 * warning above it before touching this. GET /api/sessions/:id routes through
 * getOwnedSessionOrThrow and 403s for anyone but the owner, and cache() runs
 * BEFORE the controller, so a viewer-less key would replay the owner's 200 to
 * the next caller and never reach the ownership check. As there, the hit rate
 * costs nothing: only one person can ever get a 200 from that route.
 *
 * The payload is a Session row WITH its interruptions included (see
 * findSessionById), so logInterruption has to bump the content counter even
 * though it writes to a different table. session.service.js does.
 *
 * @param {string} sessionId @param {string} viewerId @param {number} version
 */
export const sessionKey = (sessionId, viewerId, version) =>
  `${SESSION_EPOCH}:session:one:${sessionId}:${viewerId}:v${version}`;

/**
 * GET /api/sessions - the caller's own history, and the ONLY route serving it.
 *
 * Unlike postUserListKey this is not shared with a by-user route, because there
 * is no GET /api/sessions/user/:userId: study history is private in this API.
 * If one is ever added, it must NOT share this key unless it returns the
 * identical shape - findSessionsByUser omits interruptions, findSessionById
 * includes them.
 *
 * @param {string} userId @param {number} version
 */
export const sessionUserListKey = (userId, version) =>
  `${SESSION_EPOCH}:session:byuser:${userId}:u${version}`;

/**
 * Group version counters.
 *
 * Two scopes again, but split differently from sessions and posts: both are
 * per-GROUP rather than one per-entity and one per-owner, because a group is
 * read by its members rather than listed by its owner.
 *
 *   self    - name, description, privacy, ownerId
 *   members - the membership rows
 *
 * The split earns its keep on setMemberRole, which changes a role without
 * changing the group or the member COUNT, and so bumps `members` alone.
 *
 * @param {string} groupId
 */
export const groupContentVersionKey = (groupId) =>
  `${VERSION_PREFIX}group:self:${groupId}`;

/** @param {string} groupId */
export const groupMemberVersionKey = (groupId) =>
  `${VERSION_PREFIX}group:members:${groupId}`;

/**
 * Group key builders.
 *
 * ⚠ THE VIEWER IS IN groupKey, and for a DIFFERENT reason from postKey and
 * sessionKey - so it is not enough to have read those.
 *
 * GET /api/groups/:id is open to any authenticated caller and 403s for nobody.
 * What makes it per-viewer is sanitizeGroup in studyGroup.service.js, which
 * strips joinCode unless the requester is the owner: the route returns TWO
 * different bodies depending on who asks. A viewer-less key would cache
 * whichever one happened to be computed first, and if that was the owner's, the
 * private group's join code would be served to every non-member who asked next.
 *
 * Unlike postKey the hit rate DOES cost something here - one entry per reader
 * rather than one entry - and it is worth paying. The alternative is moving
 * sanitisation after the cache, which means caching the unsanitised row, which
 * means a secret sitting in Redis under a key any request can compose.
 *
 * STAMPED WITH BOTH COUNTERS. The payload includes _count.memberships (see
 * findGroupById), so a join or a leave changes this body without touching the
 * group row - the member counter is what covers that.
 *
 * @param {string} groupId @param {string} viewerId
 * @param {number} contentVersion @param {number} memberVersion
 */
export const groupKey = (groupId, viewerId, contentVersion, memberVersion) =>
  `${GROUP_EPOCH}:group:one:${groupId}:${viewerId}:c${contentVersion}:m${memberVersion}`;

/**
 * GET /api/groups/:id/members.
 *
 * NO viewer, and that is the right call rather than an oversight - the rule is
 * the one userKey states: key by viewer exactly when the answer depends on who
 * is asking. listMembers takes no requester argument, applies no sanitisation
 * and returns the same {id, username, avatarUrl} rows to every caller.
 *
 * Note it is open to non-members. That is existing behaviour, not something
 * this cache introduces; if it is ever gated, the viewer goes into this key in
 * the same commit.
 *
 * @param {string} groupId @param {number} version
 */
export const groupMembersKey = (groupId, version) =>
  `${GROUP_EPOCH}:group:members:${groupId}:m${version}`;

/**
 * Routine version counters. The session pair exactly - one per routine, one per
 * owner.
 *
 * @param {string} routineId
 */
export const routineContentVersionKey = (routineId) =>
  `${VERSION_PREFIX}routine:self:${routineId}`;

/** @param {string} userId */
export const routineOwnerVersionKey = (userId) =>
  `${VERSION_PREFIX}routine:owner:${userId}`;

/**
 * Routine key builders.
 *
 * ⚠ THE VIEWER IS IN routineKey, for sessionKey's reason: getRoutine routes
 * through getOwnedRoutineOrThrow and 403s for anyone but the owner.
 *
 * Worth knowing that POST /api/routines/:id/clone is deliberately NOT
 * ownership-gated - taking someone else's routine is the feature - but it is a
 * write and never served from this cache, so the two facts do not conflict.
 *
 * The payload includes todoItems (findRoutineById), so every todo write bumps
 * the content counter even though it targets a different table.
 *
 * @param {string} routineId @param {string} viewerId @param {number} version
 */
export const routineKey = (routineId, viewerId, version) =>
  `${ROUTINE_EPOCH}:routine:one:${routineId}:${viewerId}:v${version}`;

/**
 * GET /api/routines - the caller's own routines.
 *
 * Not shared with any by-user route, exactly as sessionUserListKey is not, and
 * with the same warning: findRoutinesByUser returns _count.todoItems while
 * findRoutineById returns the items themselves, so a future by-user route may
 * only share this key if it returns the identical shape.
 *
 * @param {string} userId @param {number} version
 */
export const routineUserListKey = (userId, version) =>
  `${ROUTINE_EPOCH}:routine:byuser:${userId}:u${version}`;

/**
 * Goal version counter.
 *
 * ONE scope, per owner, where sessions and routines each need two. That falls
 * out of the shape of the entity rather than being an omission: GET
 * /api/goals/:period returns one row of the very list GET /api/goals returns,
 * so no write can change one without changing the other and a second counter
 * would only ever be bumped in lockstep with the first.
 *
 * @param {string} userId
 */
export const goalOwnerVersionKey = (userId) =>
  `${VERSION_PREFIX}goal:owner:${userId}`;

/**
 * Goal key builders.
 *
 * NO VIEWER SEGMENT, and unlike userKey that is not a judgement call: every
 * route in this router is /me-shaped, taking the owner from req.user.id with no
 * path parameter naming a user at all. The caller IS the subject, so the key
 * built from the subject is already per-viewer and a second copy of the same id
 * would say nothing.
 *
 * @param {string} userId @param {number} version
 */
export const goalListKey = (userId, version) =>
  `${GOAL_EPOCH}:goal:byuser:${userId}:u${version}`;

/**
 * One period's goal. Not shared with goalListKey despite being a subset of it -
 * the payloads are genuinely different shapes (a row versus an array), which is
 * the test userListKey's comment sets for when two routes may share a key.
 *
 * @param {string} userId @param {string} period @param {number} version
 */
export const goalKey = (userId, period, version) =>
  `${GOAL_EPOCH}:goal:one:${userId}:${period}:u${version}`;

/**
 * Goal progress.
 *
 * ⚠ STAMPED WITH TWO COUNTERS FROM DIFFERENT DOMAINS, which no other key in
 * this file does, and the second one is load-bearing. The payload is
 * minutesStudied measured against targetMinutes: the target moves when a GOAL
 * is written, and the minutes move when a SESSION ends. A key carrying only the
 * goal counter would keep serving this morning's progress all day, because
 * finishing a session bumps nothing in the goal namespace.
 *
 * Note what NEITHER counter covers: the period boundary. Progress is measured
 * from midnight (or Monday), and nothing bumps at midnight. That is what
 * CACHE_TTL_GOAL_PROGRESS_SEC is really bounding - see the warning in
 * config/cache.js.
 *
 * @param {string} userId @param {string} period
 * @param {number} goalVersion @param {number} sessionVersion
 */
export const goalProgressKey = (userId, period, goalVersion, sessionVersion) =>
  `${GOAL_EPOCH}:goal:progress:${userId}:${period}:g${goalVersion}:s${sessionVersion}`;

/**
 * Streak version counter. Keyed on the user the streak BELONGS to, not the one
 * reading it - see the note on streakKey.
 *
 * @param {string} userId
 */
export const streakUserVersionKey = (userId) =>
  `${VERSION_PREFIX}streak:user:${userId}`;

/**
 * Streak key builder.
 *
 * SHARED BY GET /me AND GET /user/:userId, which is the userListKey pattern and
 * passes its test: both routes resolve to readStreak(id) and return
 * byte-identical data - getMyStreak merely skips the existence check. Separate
 * keys would cache the same payload twice and halve the hit rate. If those two
 * response shapes ever diverge, they must stop sharing this key.
 *
 * NO VIEWER, and here that IS a judgement call rather than a structural fact,
 * so it is worth stating: a streak is deliberately public to any authenticated
 * caller, because the leaderboard is the feature. Every reader gets the same
 * body, so a per-viewer key would store one copy per reader of identical data.
 * If streaks are ever made private or follower-gated, the viewer goes into this
 * key in the same commit.
 *
 * @param {string} userId @param {number} version
 */
export const streakKey = (userId, version) =>
  `${STREAK_EPOCH}:streak:one:${userId}:v${version}`;

/**
 * Subscription version counter.
 *
 * @param {string} userId
 */
export const subscriptionUserVersionKey = (userId) =>
  `${VERSION_PREFIX}subscription:user:${userId}`;

/**
 * Subscription key builder.
 *
 * No viewer segment, for goalListKey's structural reason rather than
 * streakKey's judgement: GET /api/subscriptions/me has no path parameter, so
 * the userId in this key is always the caller's own and already identifies the
 * viewer. Only one person can ever read a given key, which is the property
 * postKey needs an explicit viewer segment to achieve.
 *
 * If a by-user route is ever added - an admin view, say - it must NOT share
 * this key without a viewer segment, or it would replay one caller's
 * subscription to the next.
 *
 * @param {string} userId @param {number} version
 */
export const subscriptionKey = (userId, version) =>
  `${SUBSCRIPTION_EPOCH}:sub:one:${userId}:v${version}`;

/**
 * Notification version counter. One per user, covering the single cached read
 * in that router.
 *
 * @param {string} userId
 */
export const notificationUserVersionKey = (userId) =>
  `${VERSION_PREFIX}notification:user:${userId}`;

/**
 * The unread badge.
 *
 * The ONLY cached read in the notification router. The paginated list is
 * deliberately uncached, exactly as GET /all is in the post, like, comment and
 * follow routers: every notification this user receives would invalidate every
 * page of it, and the key would have to carry page, limit and unreadOnly - so
 * it would thrash and grow at once.
 *
 * No viewer segment, for subscriptionKey's reason: the route is /me-shaped and
 * the userId is the caller's own.
 *
 * @param {string} userId @param {number} version
 */
export const notificationUnreadKey = (userId, version) =>
  `${NOTIFICATION_EPOCH}:notif:unread:${userId}:v${version}`;

/**
 * Reads version counters, in the order asked for.
 *
 * A counter that has never been bumped does not exist and reads as 0 — without
 * that, a cold Redis would compose keys containing "undefined".
 *
 * Returns NULL, not zeros, when Redis is unreachable. The distinction matters:
 * zeros would be a valid-looking answer and the caller would go on to spend two
 * further doomed round trips. Fully down, those reject instantly — but a WEDGED
 * Redis that accepts connections and stops answering burns the full 1s
 * commandTimeout on each, so "fail open" would quietly become "fail slow",
 * which is the failure mode that actually takes an API down.
 *
 * @param {string[]} keys
 * @returns {Promise<number[] | null>} versions aligned with the input, or null
 */
export const readVersions = async (keys) => {
  // MGET with no arguments is an error, and an empty list is legitimate.
  if (keys.length === 0) return [];

  try {
    const values = await getRedis().mget(keys);
    noteSuccess();
    return values.map((value) => Number(value) || 0);
  } catch (err) {
    noteFailure("mget versions", err);
    return null;
  }
};

/**
 * Reads and parses one cached payload.
 *
 * A JSON.parse failure is reported as a MISS, not an error. A truncated or
 * hand-edited value is not worth a 500 when re-reading Postgres is right there,
 * and this is the difference between one bad key degrading one request and it
 * breaking a route until someone flushes Redis by hand.
 *
 * @param {string} key
 * @returns {Promise<unknown | null>} the payload, or null on a miss
 */
export const readCached = async (key) => {
  try {
    const raw = await getRedis().get(key);
    noteSuccess();
    if (raw === null) return null;

    try {
      return JSON.parse(raw);
    } catch {
      log.warn(`discarding unparseable value at ${key}`);
      return null;
    }
  } catch (err) {
    noteFailure(`get ${key}`, err);
    return null;
  }
};

/**
 * Stores one payload under a TTL.
 *
 * Called fire-and-forget from the response path, so it must swallow
 * everything: the response it belongs to has ALREADY been computed and is on
 * its way to the client, and failing to memoise it is not a reason to break it.
 * The catch is mandatory rather than defensive — an unhandled rejection
 * terminates the process on modern Node.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSec
 * @returns {Promise<void>}
 */
export const writeCached = async (key, value, ttlSec) => {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSec);
    noteSuccess();
  } catch (err) {
    noteFailure(`set ${key}`, err);
  }
};

/**
 * Invalidates by INCREMENTING version counters.
 *
 * Nothing is deleted. Readers stamp the current version into their cache key,
 * so a bump silently orphans every key built from the previous one and the very
 * next read composes a different key and misses. That is what makes this O(1)
 * per scope instead of the O(N) SCAN a wildcard delete would need.
 *
 * INCR on a missing key creates it at 1, so a counter needs no initialisation.
 *
 * MUST be called AFTER the database write has resolved, never before or
 * concurrently. Bumping first lets a reader observe the new version, query the
 * not-yet-committed row, and cache the OLD body under the NEW key — where it
 * would stay for the full TTL. Bumping last can only ever orphan a key.
 *
 * @param {string[]} keys - version keys, from the version-key builders above
 */
export const bumpVersions = async (keys) => {
  // Duplicates are free to drop and common: a bulk delete names the same post
  // once per comment left on it.
  const unique = [...new Set(keys)];
  if (unique.length === 0) return;

  if (unique.length >= LARGE_INVALIDATION) {
    log.warn(`unusually large invalidation: ${unique.length} counters`);
  }

  try {
    const redis = getRedis();

    for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
      const pipeline = redis.pipeline();

      for (const key of unique.slice(index, index + CHUNK_SIZE)) {
        pipeline.incr(key);
        pipeline.expire(key, VERSION_TTL_SEC);
      }

      const results = await pipeline.exec();

      // A pipeline RESOLVES even when every command in it failed: ioredis
      // catches each command's rejection and stores it as an [error, null]
      // tuple (see built/Pipeline.js). A try/catch alone would therefore report
      // a total outage as success — and a silently-failed invalidation is the
      // worst bug available here, because it serves stale data with no log line.
      const failure = results?.find(([err]) => err);
      if (failure) throw failure[0];
    }

    noteSuccess();
  } catch (err) {
    // Invalidation is lost, so entries stamped with the old version stay
    // readable until their TTL lapses. That bounded staleness is the price of
    // the API staying up, and is why every TTL in config/cache.js is short.
    noteFailure(`incr ${unique.length} versions`, err);
  }
};
