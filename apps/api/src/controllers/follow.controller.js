import * as followService from "../services/follow.service.js";

/**
 * The required-id guard, copied from like.controller.js and needed for the same
 * reason: a number, an object or null reaching Prisma is a 500 for what is
 * plainly a bad request.
 *
 * Note what it does NOT check — that the id is not the caller's own. Self-follow
 * is policy, and it is rejected in the service, which is the only layer a future
 * caller cannot bypass.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isId = (value) => typeof value === "string" && value.length > 0;

/**
 * Resolves the ":userId" path segment, mapping the literal "me" to the caller.
 *
 * Without it, GET /api/follows/user/me/followers would look up a user whose id
 * is literally "me" and 404 — a papercut for any client that would rather not
 * thread its own id through every call.
 *
 * EXPORTED, exactly as its counterpart in like.controller.js is, because
 * follow.routes.js must build every cached route's key from the SAME resolved
 * id before the handler runs. Two copies of this line would not merely drift — a
 * cache that resolved "me" differently from the handler would stamp its entries
 * with a counter (v:follow:user:me) that nothing ever bumps, so every caller's
 * /user/me read would share one entry and users would be served each other's
 * follow graphs.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
export const resolveTargetUserId = (req) =>
  req.params.userId === "me" ? req.user.id : req.params.userId;

export const create = async (req, res, next) => {
  try {
    // followingId alone is destructured, so a followerId smuggled into the body
    // is ignored rather than honoured — the follower is always the token holder.
    const { followingId } = req.body;
    if (!isId(followingId)) {
      return res.status(400).json({ error: "followingId is required" });
    }

    const { follow, created } = await followService.followUser({
      followerId: req.user.id,
      followingId,
    });

    // 201 the first time, 200 for a repeat. Following is idempotent (see
    // followUser), so a double-tap is a success, not a 409 — but a client that
    // does care which happened can still tell from the status.
    res.status(created ? 201 : 200).json(follow);
  } catch (err) {
    next(err);
  }
};

export const summary = async (req, res, next) => {
  try {
    const result = await followService.getFollowSummary(
      resolveTargetUserId(req),
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const listFollowers = async (req, res, next) => {
  try {
    const followers = await followService.listFollowersByUser(
      resolveTargetUserId(req),
    );
    res.status(200).json(followers);
  } catch (err) {
    next(err);
  }
};

export const listFollowing = async (req, res, next) => {
  try {
    const following = await followService.listFollowingByUser(
      resolveTargetUserId(req),
    );
    res.status(200).json(following);
  } catch (err) {
    next(err);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const following = await followService.listMyFollowing(req.user.id);
    res.status(200).json(following);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/follows/all — one page of every edge in the graph.
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
 *     handler in this file does.
 */
export const listAll = async (req, res, next) => {
  try {
    const { items, total, page, limit } = await followService.listAllFollows(
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

/**
 * DELETE /api/follows/user/:userId — the caller unfollows that user.
 *
 * Always 204, even when there was nothing to delete: this is a toggle, and
 * idempotent unfollow is the mirror of idempotent follow. The count deleteMany
 * returns is deliberately discarded — it is only ever 0 or 1, and both mean the
 * same thing to the client ("you do not follow this person").
 *
 * resolveTargetUserId is applied here too, so DELETE /user/me is a well-formed
 * request that reaches the service — where it is rejected as a self-edge with a
 * 400 rather than silently deleting nothing.
 */
export const remove = async (req, res, next) => {
  try {
    await followService.unfollowUser(resolveTargetUserId(req), req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/follows/followers/:userId — the caller removes that user as a
 * follower.
 *
 * The ONLY route in this API where the caller's id is the followingId rather
 * than the followerId. The argument order is (follower, followee), so the path
 * param goes first and req.user.id second — the exact opposite of remove()
 * directly above. Getting these two round the wrong way would let anyone sever
 * anyone else's edges, which is why the service exposes them as two separate
 * functions rather than one with a direction flag.
 *
 * 204 always, for the same reason as remove().
 */
export const removeFollower = async (req, res, next) => {
  try {
    await followService.removeFollower(req.params.userId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyFollows.
    const { count } = await followService.deleteMyFollows(req.user.id);

    // 200 with a body rather than the 204 its single-edge siblings return: the
    // count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};
