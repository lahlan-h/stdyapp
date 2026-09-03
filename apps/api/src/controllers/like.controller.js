import * as likeService from "../services/like.service.js";

/**
 * The required-id counterpart of isValidLink in post.controller.js, and needed
 * for the same reason: a number, an object or null reaching Prisma is a 500 for
 * what is plainly a bad request.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isId = (value) => typeof value === "string" && value.length > 0;

export const create = async (req, res, next) => {
  try {
    // postId alone is destructured, so a userId smuggled into the body is
    // ignored rather than honoured — the liker is always the token holder.
    const { postId } = req.body;
    if (!isId(postId)) return res.status(400).json({ error: "postId is required" });

    const { like, created } = await likeService.likePost({
      userId: req.user.id,
      postId,
    });

    // 201 the first time, 200 for a repeat. Liking is idempotent (see
    // likePost), so a double-tap is a success, not a 409 — but a client that
    // does care which happened can still tell from the status.
    res.status(created ? 201 : 200).json(like);
  } catch (err) {
    next(err);
  }
};

export const listByPost = async (req, res, next) => {
  try {
    const likes = await likeService.listLikesByPost(req.params.postId);
    res.status(200).json(likes);
  } catch (err) {
    next(err);
  }
};

export const summary = async (req, res, next) => {
  try {
    const result = await likeService.getLikeSummary(req.params.postId, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const likes = await likeService.listMyLikes(req.user.id);
    res.status(200).json(likes);
  } catch (err) {
    next(err);
  }
};

export const listByUser = async (req, res, next) => {
  try {
    // "me" resolves to the caller, copying post.controller.js — without it
    // GET /api/likes/user/me would look up a user whose id is literally "me"
    // and 404, a papercut for any client that would rather not thread its own
    // id through every call.
    const { userId } = req.params;
    const targetId = userId === "me" ? req.user.id : userId;

    const likes = await likeService.listLikesByUser(targetId);
    res.status(200).json(likes);
  } catch (err) {
    next(err);
  }
};

export const removeByPost = async (req, res, next) => {
  try {
    // Always 204, even when there was nothing to delete: this is a toggle, and
    // idempotent unlike is the mirror of idempotent like. The count deleteMany
    // returns is deliberately discarded — it is only ever 0 or 1, and both mean
    // the same thing to the client ("you have not liked this post").
    await likeService.unlikePost(req.params.postId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyLikes.
    const { count } = await likeService.deleteMyLikes(req.user.id);

    // 200 with a body rather than the 204 its single-post sibling returns: the
    // count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};
