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

/**
 * An optional link is valid when it is absent, an explicit null (meaning
 * "detach", on PATCH), or a non-empty string. A number or an object would
 * otherwise reach Prisma and come back as a 500 for what is a bad request.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isValidLink = (value) =>
  value === undefined || value === null || (typeof value === "string" && value.length > 0);

export const create = async (req, res, next) => {
  try {
    const { sessionId, routineId, caption, photoUrl } = req.body;

    // caption and photoUrl are the post; sessionId and routineId are optional
    // links, so a bare photo and caption is a valid post.
    if (!caption) return res.status(400).json({ error: "caption is required" });
    if (!photoUrl) return res.status(400).json({ error: "photoUrl is required" });

    if (!isValidLink(sessionId)) {
      return res.status(400).json({ error: "sessionId must be a string or omitted" });
    }
    if (!isValidLink(routineId)) {
      return res.status(400).json({ error: "routineId must be a string or omitted" });
    }

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

export const listByUser = async (req, res, next) => {
  try {
    // "me" resolves to the caller. Without it, GET /api/posts/user/me would
    // look up a user whose id is literally "me" and 404 — a papercut for any
    // client that would rather not thread its own id through every call.
    const { userId } = req.params;
    const targetId = userId === "me" ? req.user.id : userId;

    const posts = await postService.listPostsByUser(targetId);
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
    const { caption, photoUrl, sessionId, routineId } = req.body;

    // PATCH semantics: every field optional, but an empty body would return 200
    // having changed nothing, which is a client bug worth surfacing. Note that
    // an explicit null counts as a change — {"sessionId": null} is a detach.
    if (
      caption === undefined &&
      photoUrl === undefined &&
      sessionId === undefined &&
      routineId === undefined
    ) {
      return res
        .status(400)
        .json({ error: "caption, photoUrl, sessionId or routineId is required" });
    }
    if (caption !== undefined && !caption) {
      return res.status(400).json({ error: "caption must not be empty" });
    }
    if (photoUrl !== undefined && !isSafePhotoUrl(photoUrl)) {
      return res.status(400).json({ error: "photoUrl must be a valid http or https URL" });
    }
    if (!isValidLink(sessionId)) {
      return res.status(400).json({ error: "sessionId must be a string or null" });
    }
    if (!isValidLink(routineId)) {
      return res.status(400).json({ error: "routineId must be a string or null" });
    }

    const post = await postService.updatePost(req.params.id, req.user.id, {
      caption,
      photoUrl,
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
