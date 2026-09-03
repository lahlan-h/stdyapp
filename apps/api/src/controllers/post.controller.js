import * as postService from "../services/post.service.js";

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * photoUrl is rendered by the clients, and new URL() alone accepts ANY scheme —
 * including javascript: and data:. If the web app ever puts this in an href
 * rather than an img src, an unchecked value is stored XSS, so the protocol is
 * restricted here, at the only point where it enters.
 *
 * This mirrors avatarUrlSchema in validation/user.validation.js; that one is
 * module-private and built on Zod, which the routes in this half of the API
 * don't use.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isSafePhotoUrl = (value) => {
  if (typeof value !== "string") return false;
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    // new URL() throws on anything that isn't an absolute URL
    return false;
  }
};

export const create = async (req, res, next) => {
  try {
    const { sessionId, routineId, caption, photoUrl } = req.body;

    // All four are required — sessionId and routineId are non-nullable columns,
    // and a post with no caption or photo is not a post.
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    if (!routineId) return res.status(400).json({ error: "routineId is required" });
    if (!caption) return res.status(400).json({ error: "caption is required" });
    if (!photoUrl) return res.status(400).json({ error: "photoUrl is required" });

    if (!isSafePhotoUrl(photoUrl)) {
      return res.status(400).json({ error: "photoUrl must be a valid http or https URL" });
    }

    const post = await postService.createPost({
      userId: req.user.id,
      sessionId,
      routineId,
      caption,
      photoUrl,
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

export const listMine = async (req, res, next) => {
  try {
    const posts = await postService.listMyPosts(req.user.id);
    res.status(200).json(posts);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const { caption, photoUrl } = req.body;

    // PATCH semantics: both optional, but an empty body would return 200 having
    // changed nothing, which is a client bug worth surfacing.
    if (caption === undefined && photoUrl === undefined) {
      return res.status(400).json({ error: "caption or photoUrl is required" });
    }
    if (caption !== undefined && !caption) {
      return res.status(400).json({ error: "caption must not be empty" });
    }
    if (photoUrl !== undefined && !isSafePhotoUrl(photoUrl)) {
      return res.status(400).json({ error: "photoUrl must be a valid http or https URL" });
    }

    const post = await postService.updatePost(req.params.id, req.user.id, {
      caption,
      photoUrl,
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
