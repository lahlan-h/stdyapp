import * as blockService from "../services/block.service.js";

/**
 * The required-id guard, copied from follow.controller.js and needed for the same
 * reason: a number, an object or null reaching Prisma is a 500 for what is
 * plainly a bad request.
 *
 * Note what it does NOT check — that the id is not the caller's own. Self-block
 * is policy, and it is rejected in the service, which is the only layer a future
 * caller cannot bypass.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isId = (value) => typeof value === "string" && value.length > 0;

/**
 * NOTE: there is deliberately no resolveTargetUserId in this file, where
 * follow.controller.js and like.controller.js both export one.
 *
 * That helper exists there to map the literal "me" onto the caller, and
 * follow.routes.js spends a paragraph on the trap it creates: every cached route
 * must resolve the param through the SAME function before building its key, or
 * entries get stamped with a counter (v:follow:user:me) that nothing ever bumps
 * and callers are served each other's graphs.
 *
 * No route here reads another user's data, so "me" has nothing to mean. GET
 * /user/me/status would ask "am I blocking myself", which is permanently false,
 * and DELETE /user/me would delete a row the service refuses to create. Not
 * resolving "me" at all removes that entire class of bug from the one router
 * whose payload is private.
 */

export const create = async (req, res, next) => {
  try {
    // blockedId alone is destructured, so a blockerId smuggled into the body is
    // ignored rather than honoured — the blocker is always the token holder.
    const { blockedId } = req.body;
    if (!isId(blockedId)) {
      return res.status(400).json({ error: "blockedId is required" });
    }

    const { block, created } = await blockService.blockUser({
      blockerId: req.user.id,
      blockedId,
    });

    // 201 the first time, 200 for a repeat. Blocking is idempotent (see
    // blockUser), so a double-tap is a success, not a 409 — but a client that
    // does care which happened can still tell from the status.
    res.status(created ? 201 : 200).json(block);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blocks/user/:userId/status — have I blocked this person?
 *
 * req.params.userId is the TARGET and req.user.id is the VIEWER, in that order,
 * matching getBlockStatus's signature. The response carries blockedByMe and
 * nothing else — see the service for why blocksMe must never join it.
 */
export const status = async (req, res, next) => {
  try {
    const result = await blockService.getBlockStatus(
      req.params.userId,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blocks — the caller's own block list.
 *
 * req.user.id, never req.params: this router has no route that reads another
 * user's blocks, and this handler is where that would first go wrong.
 */
export const listMine = async (req, res, next) => {
  try {
    const blocks = await blockService.listMyBlocks(req.user.id);
    res.status(200).json(blocks);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blocks/all — one page of the CALLER'S OWN blocks.
 *
 * ⚠ The path is the same as its siblings in the other five routers; the meaning
 * is not. There /all is every row in the system. Here it is the caller's own
 * rows, because a global block list with no admin role would publish the entire
 * harassment graph to any authenticated caller. req.user.id is passed to the
 * service alongside the validated page and limit, and it is what makes the two
 * differ — if it ever stops being passed, this route silently becomes the thing
 * it is named after.
 *
 * The only route in this file that uses Zod: the query params are validated by
 * the validate() middleware on the route, so req.validated.query is already
 * coerced from strings and defaulted. Read that, never req.query, which has not
 * been through a schema.
 *
 * Returns the { data, pagination } envelope every paginated route in this API
 * returns, rather than the bare array its siblings in this file return.
 */
export const listAll = async (req, res, next) => {
  try {
    const { items, total, page, limit } = await blockService.listMyBlocksPage({
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

/**
 * DELETE /api/blocks/user/:userId — the caller unblocks that user.
 *
 * Always 204, even when there was nothing to delete: this is a toggle, and
 * idempotent unblock is the mirror of idempotent block. The count deleteMany
 * returns is deliberately discarded — it is only ever 0 or 1, and both mean the
 * same thing to the client ("you do not block this person").
 *
 * The argument order is (target, caller), matching unblockUser and the remove()
 * in follow.controller.js. There is no removeBlocker counterpart here, and its
 * absence is the privacy model rather than an omission — see unblockUser.
 */
export const remove = async (req, res, next) => {
  try {
    await blockService.unblockUser(req.params.userId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyBlocks.
    const { count } = await blockService.deleteMyBlocks(req.user.id);

    // 200 with a body rather than the 204 its single-edge sibling returns: the
    // count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};
