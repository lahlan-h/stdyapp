import * as postService from "../services/post.service.js";

/**
 * POST /api/posts - one multipart request carrying the photo and the caption.
 *
 * The body arrives in two halves and they are read from different places, which
 * is the one thing worth knowing about this handler: uploadImage() puts the file
 * on req.file and the text fields on req.body, and validate() then parses those
 * fields onto req.validated.body. There is no schema for the file - Zod never
 * sees it - so uploadImage is what guarantees req.file.buffer is a non-empty
 * Buffer within the size cap, and imageType.js is what decides it is an image.
 *
 * Every check that used to live here is now in createPostSchema: shape, caption
 * length, uuid-ness of the links, and the loud 400 for a client still sending a
 * photoUrl.
 */
export const create = async (req, res, next) => {
  try {
    const { sessionId, routineId, caption } = req.validated.body;

    const post = await postService.createPost({
      userId: req.user.id,
      sessionId,
      routineId,
      caption,
      photo: req.file.buffer,
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const post = await postService.getPost(req.params.id, req.user.id);
    res.status(200).json(post);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/posts/all - one page of the global feed - every post by everyone, newest first.
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
    const { items, total, page, limit } = await postService.listAllPosts(
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
    const posts = await postService.listMyPosts(req.user.id);
    res.status(200).json(posts);
  } catch (err) {
    next(err);
  }
};

/**
 * "me" resolves to the caller. Without it, GET /api/posts/user/me would look up
 * a user whose id is literally "me" and 404 — a papercut for any client that
 * would rather not thread its own id through every call.
 *
 * EXPORTED so post.routes.js can build the cache key with this exact function
 * rather than a copy, which is a correctness requirement and not tidiness:
 * keying on the raw param would compose "…byuser:me:…" against a counter
 * (v:post:author:me) that nothing ever bumps, so every caller's GET /user/me
 * would share one cache entry and users would be served each other's posts.
 * like.controller.js exports resolveTargetUserId for the identical reason.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export const resolveTargetUserId = (req) =>
  req.params.userId === "me" ? req.user.id : req.params.userId;

export const listByUser = async (req, res, next) => {
  try {
    const posts = await postService.listPostsByUser(resolveTargetUserId(req));
    res.status(200).json(posts);
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyPosts.
    const { count } = await postService.deleteMyPosts(req.user.id);

    // 200 with a body rather than the 204 its single-post sibling returns: the
    // count is the one thing a caller cannot work out for itself afterwards,
    // and a client wants to say "12 posts deleted".
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    // updatePostSchema owns all of this now, including the "at least one field"
    // refine that stops an empty body returning 200 having changed nothing, and
    // the three-state link semantics (absent = leave, uuid = attach, null =
    // detach) that .nullish() preserves.
    //
    // photoUrl is gone from the schema entirely: a post's photo is fixed at
    // creation, so sending one is now a 400 rather than a silent no-op.
    const { caption, sessionId, routineId } = req.validated.body;

    const post = await postService.updatePost(req.params.id, req.user.id, {
      caption,
      sessionId,
      routineId,
    });
    res.status(200).json(post);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await postService.deletePost(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
