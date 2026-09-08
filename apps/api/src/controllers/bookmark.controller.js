import * as bookmarkService from "../services/bookmark.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated, never from req.body/req.params — the rule
 * session.controller.js and users.controller.js follow, and what makes it visible
 * at each call site that a schema has actually run. There is no hand-rolled
 * `isId` helper here, unlike like.controller.js and block.controller.js: every
 * route on this router carries a Zod schema instead.
 *
 * NOTE: there is deliberately no resolveTargetUserId in this file, where
 * like.controller.js and follow.controller.js both export one.
 *
 * That helper exists there to map the literal "me" onto the caller for a
 * "/user/:userId" route. This router has no such route and must never get one — a
 * saved list is a reading history, and publishing it is the one thing this
 * feature exists to avoid. With no by-user path there is nothing for "me" to
 * resolve, which also removes the cache-key trap like.routes.js spends a
 * paragraph on. See the authorisation note in bookmark.service.js.
 */

export const create = async (req, res, next) => {
  try {
    // postId alone is destructured, and createBookmarkSchema is a strictObject
    // besides, so a userId smuggled into the body is rejected outright rather
    // than silently ignored — the saver is always the token holder.
    const { postId } = req.validated.body;

    const { bookmark, created } = await bookmarkService.saveBookmark({
      userId: req.user.id,
      postId,
    });

    // 201 the first time, 200 for a repeat. Saving is idempotent (see
    // saveBookmark), so a double-tap is a success, not a 409 — but a client that
    // does care which happened can still tell from the status.
    res.status(created ? 201 : 200).json(bookmark);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/bookmarks/post/:postId/status — have I saved this post?
 *
 * req.params.postId is the target and req.user.id is the viewer, in that order,
 * matching getBookmarkStatus's signature. The response carries savedByMe and
 * savedAt and nothing else — see the service for why a save COUNT must never
 * join them.
 */
export const status = async (req, res, next) => {
  try {
    const result = await bookmarkService.getBookmarkStatus(
      req.validated.params.postId,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/bookmarks — the caller's own saved list, newest first.
 *
 * req.user.id, never req.params: this router has no route that reads another
 * user's bookmarks, and this handler is where that would first go wrong.
 */
export const listMine = async (req, res, next) => {
  try {
    const bookmarks = await bookmarkService.listMyBookmarks(req.user.id);
    res.status(200).json(bookmarks);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/bookmarks/all — one page of the CALLER'S OWN bookmarks.
 *
 * ⚠ The path is the same as its siblings in the public routers; the meaning is
 * not. There /all is every row in the system. Here it is the caller's own rows,
 * because a global saved list with no admin role would publish every user's
 * reading history to any authenticated caller. req.user.id is passed to the
 * service alongside the validated page and limit, and it is what makes the two
 * differ — if it ever stops being passed, this route silently becomes the thing
 * it is named after. The same warning listAll in block.controller.js carries.
 *
 * Returns the { data, pagination } envelope every paginated route in this API
 * returns, rather than the bare array its siblings in this file return.
 */
export const listAll = async (req, res, next) => {
  try {
    const { items, total, page, limit } =
      await bookmarkService.listMyBookmarksPage({
        ...req.validated.query,
        userId: req.user.id,
      });

    res.status(200).json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    // Always 204, even when there was nothing to delete: this is a toggle, and
    // idempotent unsave is the mirror of idempotent save. The count deleteMany
    // returns is deliberately discarded — it is only ever 0 or 1, and both mean
    // the same thing to the client ("you have not saved this post").
    await bookmarkService.unsaveBookmark(req.validated.params.postId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyBookmarks.
    const { count } = await bookmarkService.deleteMyBookmarks(req.user.id);

    // 200 with a body rather than the 204 its single-post sibling returns: the
    // count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};
