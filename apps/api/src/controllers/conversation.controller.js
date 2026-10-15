import * as conversationService from "../services/conversation.service.js";

/**
 * Thin by design: status codes and response shape only, no policy - who may
 * message whom lives in conversation.service.js.
 *
 * Input is read from req.validated, never from req.body or req.params, so it
 * is visible at each call site that a schema has run. try/catch rather than
 * asyncHandler(), matching every feature controller in this API - see the
 * note in comment.controller.js.
 *
 * The caller is always req.user.id; the other person is always the :userId in
 * the path. Nothing here accepts a conversation id from a client.
 */

/** GET /api/conversations - the caller's conversations, most recently active first. */
export const list = async (req, res, next) => {
  try {
    const { items, total, page, limit } = await conversationService.listConversations({
      userId: req.user.id,
      ...req.validated.query,
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

/** GET /api/conversations/unread-count - how many people have unread messages. */
export const unreadCount = async (req, res, next) => {
  try {
    res.status(200).json(await conversationService.getUnreadConversationCount(req.user.id));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations/with/:userId/messages - history with one person,
 * newest first. `hasMore` rather than a page count: the history is read
 * backwards by cursor, and the only question a client asks is "is there more".
 */
export const history = async (req, res, next) => {
  try {
    const { items, hasMore } = await conversationService.getHistory({
      viewerId: req.user.id,
      otherUserId: req.validated.params.userId,
      ...req.validated.query,
    });
    res.status(200).json({ data: items, hasMore });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations/with/:userId/messages - send one message.
 *
 * Always 201, unlike the idempotent follow and like: a second identical
 * message is a second thing said, not a retry of the first.
 */
export const send = async (req, res, next) => {
  try {
    const message = await conversationService.sendMessage({
      senderId: req.user.id,
      recipientId: req.validated.params.userId,
      body: req.validated.body.body,
    });
    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
};

/** POST /api/conversations/with/:userId/read - mark the chat read; answers the new badge. */
export const markRead = async (req, res, next) => {
  try {
    const result = await conversationService.markConversationRead({
      viewerId: req.user.id,
      otherUserId: req.validated.params.userId,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
