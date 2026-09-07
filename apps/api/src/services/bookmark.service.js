import * as bookmarkRepo from "../repositories/bookmark.repository.js";
// Cross-domain repository import, precedented by like.service.js reaching for
// post.repository.js: the existence check below needs posts, and going through
// post.service.js instead would drag its ownership gate along with it — a gate
// that is wrong here, since you are supposed to save other people's posts.
import { findPostById } from "../repositories/post.repository.js";
// The shared duck-typing helper. toHttpError from the same module is deliberately
// NOT reused, for the reason like.service.js gives: it returns HttpError, which
// belongs to the users/auth half of this API, its P2002 message would read "That
// value is already in use" for a repeat save, and it maps P2003 to a 409 when a
// bad postId is plainly a 404.
import { isPrismaError } from "../utils/prismaError.js";
import { bumpVersions, bookmarkUserVersionKey } from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — like.service.js's structure with block.service.js's
 * privacy, and the combination is the whole point of this module.
 *
 * like.service.js opens with "ownership of the LIKE governs writes, and nothing
 * governs reads beyond authentication", because a like is public social data. A
 * bookmark is not, so:
 *
 *   READS ARE SCOPED TOO. Every function here pins userId to the caller's own id
 *   from the access token. There is exactly ONE write scope and exactly ONE read
 *   scope, and they are the same scope. No function may take a userId from the
 *   path or the body, on a read or on a write — the WHERE clause IS the
 *   authorisation, which is why nothing here needs an ownership check after a
 *   read and why there is no forbidden() helper in this module.
 *
 * NOBODY LEARNS WHO SAVED THEIR POST. There is no "saved by" list, no save count,
 * and no route from which either can be derived. Two reasons:
 *   - Privacy: a saved list is a reading history, and reading histories are
 *     nobody else's business.
 *   - Product: a save is a private act. Surfacing it to the author turns it into
 *     a soft follow signal the saver never opted into, and users who learn that
 *     stop saving.
 * Anything that lets a caller INFER the answer — a count that moves, a list that
 * shrinks — is the same leak wearing a hat.
 *
 * GET /api/bookmarks/all is scoped to the caller too, unlike the /all route in
 * the public routers and exactly like the one in block.service.js. There is no
 * admin role in this codebase, so a global saved list would hand every user's
 * reading history to any authenticated caller.
 *
 * The consequences, stated as choices rather than oversights:
 *   - Saving your OWN post is allowed. Rejecting it would invent a 400 that every
 *     client must handle, for no product value — and "save my own post to find it
 *     later" is a real thing people do.
 *   - A post's author may NOT delete bookmarks on their post. Only the saver
 *     unsaves.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";
const PRISMA_RECORD_NOT_FOUND = "P2025";

/**
 * Existence only — note what is NOT here.
 *
 * The same function like.service.js has, with the same missing half: there is no
 * ownership check, and that absence is the feature. You are supposed to save
 * other people's posts.
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

/**
 * Invalidates every cached read a bookmark write can affect.
 *
 * ONE BUMP, where invalidateLike needs two — and the asymmetry is load-bearing,
 * so do not "fix" it to match its closest structural sibling.
 *
 * invalidateLike bumps the POST as well as the user because a like changes a
 * public per-post surface: the count and the "liked by" list, both of which
 * belong to everyone. A bookmark changes exactly one readable surface — the
 * saver's own list and their own savedByMe flag. Nothing anyone else can read
 * changes at all.
 *
 * Bumping a post-scoped counter would therefore invalidate nothing, and — worse
 * as documentation — would imply that saving is something the post's side can
 * observe. It is not, and must not become so.
 *
 * Lives in the service rather than the middleware for the reason invalidateLike
 * gives: this is the layer that holds the user a change touched. The controllers
 * here are deliberately thin.
 *
 * Nothing here can fail a write. bumpVersions swallows its own Redis errors, so
 * an outage costs a bump and leaves entries stale until their TTL lapses; it
 * never turns a successful 201 into a 500.
 *
 * Awaited rather than fired and forgotten, so a client that reads straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {string} userId
 */
const invalidateBookmark = async (userId) => {
  await bumpVersions([bookmarkUserVersionKey(userId)]);
};

/**
 * Saves a post, idempotently.
 *
 * A repeat save is NOT a 409, for the reason likePost spells out: this is a tap,
 * fired optimistically by a client that has already filled the icon in locally.
 * It arrives twice from a double-tap, from a retry on a flaky mobile connection,
 * and from an app resumed with stale state. A 409 would force every client to
 * write "if 409, treat as success" — a branch that exists only to undo the API's
 * unhelpfulness, and one some client will forget.
 *
 * A repeat save does NOT move savedAt either. That is what PATCH is for, and
 * keeping the two apart is what lets a client retry a save without silently
 * re-ordering the user's list. The early return below is the whole of that rule.
 *
 * The distinction is still preserved where it is free — `created` lets the
 * controller answer 201 or 200 without the caller having to care.
 *
 * @returns {Promise<{ bookmark: object, created: boolean }>}
 */
export const saveBookmark = async ({ userId, postId }) => {
  await assertPostExists(postId);

  const existing = await bookmarkRepo.findBookmarkByUserAndPost(userId, postId);
  // Nothing changed, so nothing to invalidate — the cheap path stays cheap, and
  // savedAt stays where it was.
  if (existing) return { bookmark: existing, created: false };

  try {
    const bookmark = await bookmarkRepo.createBookmark({ userId, postId });
    await invalidateBookmark(userId);
    return { bookmark, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const bookmark = await bookmarkRepo.findBookmarkByUserAndPost(userId, postId);
      // Bumped even though `created` is false. Unlike the early return above, a
      // row genuinely WAS inserted here — by the request that won the race. Its
      // own bump covers this, but bumping twice only orphans a key, while missing
      // one serves a stale list for the whole TTL.
      if (bookmark) {
        await invalidateBookmark(userId);
        return { bookmark, created: false };
      }
    }
    // The post was deleted inside that same window. The check above was honest
    // when it ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) throw notFound("Post");
    throw err;
  }
};

/**
 * Moves an already-saved post back to the top of the caller's list.
 *
 * THE ONE NON-IDEMPOTENT ROUTE IN THIS MODULE, and the only PATCH any of the
 * pair-shaped entities in this API has. like.routes.js, follow.routes.js and
 * block.routes.js all close with a note explaining why they have none: every
 * column on those rows is either the primary key or half the row's identity, so
 * rewriting one does not EDIT the row, it makes it a different one.
 *
 * savedAt is the exception that earns this route. It is neither the key nor half
 * the identity — it is ordering data the user owns, and "move this back to the
 * top" is a real thing to want from a saved list.
 *
 * A 404 rather than an upsert when the post is not saved, and that is deliberate:
 * PATCH names a row the caller believes exists. Creating one instead would make a
 * typo'd postId silently save something, and it would make PATCH a second, subtly
 * different POST. touchBookmark's use of update (not updateMany) is what produces
 * the P2025 this translates.
 *
 * The post existence check runs FIRST so that PATCHing an unknown post says
 * "Post not found" rather than "Bookmark not found" — the client's actual
 * mistake, and the same ordering assertPostExists gets everywhere else here.
 *
 * @returns {Promise<object>} the bookmark, with savedAt moved to now
 */
export const resaveBookmark = async (postId, userId) => {
  await assertPostExists(postId);

  try {
    const bookmark = await bookmarkRepo.touchBookmark(userId, postId);
    await invalidateBookmark(userId);
    return bookmark;
  } catch (err) {
    // The caller has not saved this post — or unsaved it between the check above
    // and this update. Either way the row they named is not there.
    if (isPrismaError(err, PRISMA_RECORD_NOT_FOUND)) throw notFound("Bookmark");
    throw err;
  }
};

/**
 * The mirror of saveBookmark's idempotency: unsaving something you never saved is
 * not an error, it is the state you asked for. deleteMany does not throw on a
 * miss, so no 404 is possible here.
 *
 * userId is always the caller's own id from the access token — that WHERE clause
 * is the entire authorisation, which is why this needs no ownership check and
 * must never accept a caller-supplied userId. A post's author cannot unsave their
 * post out of someone else's list.
 *
 * @returns {Promise<{ count: number }>}
 */
export const unsaveBookmark = async (postId, userId) => {
  const result = await bookmarkRepo.deleteBookmarkByUserAndPost(userId, postId);

  // Only when a row actually went. deleteMany reports count 0 for the "unsave
  // something you never saved" case, which changed nothing and must not spend a
  // bump — this route is a toggle clients fire freely.
  if (result.count > 0) await invalidateBookmark(userId);

  return result;
};

/**
 * Everything a bookmark icon needs, in one round trip.
 *
 * Returns savedAt alongside the flag because the two come from the same row and a
 * client rendering "Saved 3 days ago" would otherwise need a second call. null
 * when unsaved, so the shape is stable either way.
 *
 * NOTE what is absent: a count. getLikeSummary returns one because a heart renders
 * from a count AND a "did I like this"; a bookmark icon renders from the flag
 * alone, and a save count is the exact fact this entity withholds. This is named
 * a status rather than a summary for that reason — it matches getBlockStatus, not
 * getLikeSummary.
 */
export const getBookmarkStatus = async (postId, userId) => {
  await assertPostExists(postId);

  const bookmark = await bookmarkRepo.findBookmarkByUserAndPost(userId, postId);

  return {
    postId,
    savedByMe: Boolean(bookmark),
    savedAt: bookmark?.savedAt ?? null,
  };
};

/**
 * The caller's own saved list.
 *
 * No ownership gate is needed and none exists: userId is the caller's own id from
 * the access token. There is deliberately no listBookmarksByUser counterpart —
 * the function like.service.js has for reading anyone's likes. Adding one would
 * publish a reading history, so it is not missing pending implementation.
 */
export const listMyBookmarks = async (userId) => {
  return bookmarkRepo.findBookmarksByUser(userId);
};

/**
 * One page of the CALLER'S OWN bookmarks.
 *
 * Backs GET /api/bookmarks/all, whose path means something different here from
 * the public routers: there it is every row in the system, here it is the
 * caller's own rows. The userId below is what makes the two differ — it is passed
 * straight through to the repository as the WHERE clause on both the page and its
 * count. If it ever stops being passed, this route silently becomes the thing it
 * is named after.
 *
 * Returns the { items, total, page, limit } shape listUsers, listAllLikes and
 * listMyBlocksPage return, so the controller's envelope is the one every
 * paginated route in this API uses.
 */
export const listMyBookmarksPage = async ({ userId, page, limit }) => {
  const [items, total] = await bookmarkRepo.findBookmarksPageByUser({
    userId,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/**
 * "Clear my saved posts". No ownership check, and none is needed: userId is
 * always the caller's own id from the access token, so the WHERE clause IS the
 * authorisation. The route must never accept a target id from the path or body —
 * there is no admin role in this codebase, so a caller-supplied id here would let
 * anyone wipe anyone else's saved list.
 *
 * No read-before-delete, which is where this diverges from deleteMyLikes. That
 * function reads its targets first because each liked post's own cached count goes
 * stale; here the one-ended counter documented on invalidateBookmark means there
 * are no counterparties to invalidate. Nobody else's readable surface contains
 * these rows.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyBookmarks = async (userId) => {
  const result = await bookmarkRepo.deleteBookmarksByUser(userId);

  // Nothing was deleted, so nothing is stale. Saves a round trip on the repeat
  // call this idempotent route is designed to tolerate.
  if (result.count === 0) return result;

  await invalidateBookmark(userId);

  return result;
};
