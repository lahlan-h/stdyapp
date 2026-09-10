import * as commentService from "../services/comment.service.js";

/**
 * The required-id check, copied from like.controller.js and needed for the same
 * reason: a number, an object or null reaching Prisma is a 500 for what is
 * plainly a bad request.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isId = (value) => typeof value === "string" && value.length > 0;

/**
 * A cap, not a suggestion — the same reasoning as MAX_PAGE_SIZE in
 * pagination.validation.js. `body` is an unbounded Postgres text column, and
 * comments are the highest-volume free text this app accepts: the cheapest abuse
 * of this API is a megabyte comment posted in a loop, which every subsequent
 * reader of that thread then downloads.
 *
 * Worth noting the inconsistency rather than hiding it: `caption` on Post has no
 * cap and arguably should. One post per session bounds that risk in a way
 * nothing bounds this one.
 */
const MAX_COMMENT_LENGTH = 2000;

/**
 * A comment body is valid when it is a string with something in it once trimmed,
 * and no longer than the cap. Whitespace-only is rejected rather than stored: a
 * blank comment renders as an empty bubble in the thread that nobody can
 * explain, and there is no way for a reader to distinguish it from a bug.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isValidBody = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= MAX_COMMENT_LENGTH;

export const create = async (req, res, next) => {
  try {
    // postId and body alone are destructured, so a userId smuggled into the body
    // is ignored rather than honoured — the author is always the token holder.
    const { postId, body } = req.body;

    if (!isId(postId)) return res.status(400).json({ error: "postId is required" });
    if (body === undefined || body === null || body === "") {
      return res.status(400).json({ error: "body is required" });
    }
    if (!isValidBody(body)) {
      return res.status(400).json({
        error: `body must be non-empty text of at most ${MAX_COMMENT_LENGTH} characters`,
      });
    }

    // Trimmed at the boundary, so the stored value is the one every reader sees.
    // Doing it in the service instead would leave the validation above checking
    // a different string from the one written.
    const comment = await commentService.createComment({
      userId: req.user.id,
      postId,
      body: body.trim(),
    });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const comment = await commentService.getComment(req.params.id);
    res.status(200).json(comment);
  } catch (err) {
    next(err);
  }
};

export const listByPost = async (req, res, next) => {
  try {
    const comments = await commentService.listCommentsByPost(req.params.postId);
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
};

export const summary = async (req, res, next) => {
  try {
    const result = await commentService.getCommentSummary(
      req.params.postId,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/comments/all - one page of every comment in the system.
 *
 * The only route in this file that uses Zod: the query params are validated by
 * the validate() middleware on the route, so req.validated.query is already
 * coerced from strings and defaulted. Read that, never req.query, which has not
 * been through a schema.
 *
 * Two deliberate inconsistencies with its siblings here, both consequences of
 * matching GET /api/users rather than the rest of this router:
 *   - it returns a { data, pagination } envelope, not a bare array;
 *   - it still uses try/catch rather than asyncHandler(), because every other
 *     handler in this file does. asyncHandler exists for the users/auth
 *     controllers, which throw and have no catch of their own; a handler that
 *     already catches gains nothing from it.
 */
export const listAll = async (req, res, next) => {
  try {
    const { items, total, page, limit } = await commentService.listAllComments(
      req.validated.query,
    );

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

export const listMine = async (req, res, next) => {
  try {
    const comments = await commentService.listMyComments(req.user.id);
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
};

/**
 * Resolves the :userId path param, mapping the literal "me" to the caller.
 *
 * Without it, GET /api/comments/user/me would look up a user whose id is
 * literally "me" and 404 — a papercut for any client that would rather not
 * thread its own id through every call. Copied in spirit from
 * post.controller.js, which does the same inline.
 *
 * EXPORTED, unlike its counterpart there, because comment.routes.js must build
 * this route's cache key from the SAME resolved id before the handler runs. Two
 * copies of this line would not merely drift — if the cache resolved "me"
 * differently from the handler, every caller's GET /user/me would share one
 * cache key and users would be served each other's comment history.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export const resolveTargetUserId = (req) =>
  req.params.userId === "me" ? req.user.id : req.params.userId;

export const listByUser = async (req, res, next) => {
  try {
    const comments = await commentService.listCommentsByUser(resolveTargetUserId(req));
    res.status(200).json(comments);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const { body } = req.body;

    // PATCH semantics, but with exactly one editable field there is nothing to
    // make optional: an absent body would return 200 having changed nothing,
    // which is a client bug worth surfacing. Same call post.controller.js makes
    // for its all-fields-absent case.
    if (body === undefined) {
      return res.status(400).json({ error: "body is required" });
    }
    if (!isValidBody(body)) {
      return res.status(400).json({
        error: `body must be non-empty text of at most ${MAX_COMMENT_LENGTH} characters`,
      });
    }

    const comment = await commentService.updateComment(req.params.id, req.user.id, {
      body: body.trim(),
    });
    res.status(200).json(comment);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await commentService.deleteComment(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyComments.
    const { count } = await commentService.deleteMyComments(req.user.id);

    // 200 with a body rather than the 204 its single-comment sibling returns:
    // the count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};
