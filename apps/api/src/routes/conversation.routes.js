import { Router } from "express";
import {
  list,
  unreadCount,
  history,
  send,
  markRead,
} from "../controllers/conversation.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  conversationUserParamSchema,
  sendMessageSchema,
  messageHistoryQuerySchema,
} from "../validation/conversation.validation.js";
import { RATE_LIMIT_READ, RATE_LIMIT_MESSAGE_WRITE } from "../config/cache.js";

const router = Router();

// Every route reads or writes only the caller's own conversations, so
// authentication is router-level: a route added later is protected by default.
router.use(requireAuth);

/**
 * Three buckets. Reads share one; sending and marking read each get their own
 * on RATE_LIMIT_MESSAGE_WRITE, so an app marking chats read as messages arrive
 * can never spend the budget a person needs to reply. All keyed on
 * req.user.id - see middleware/rateLimit.js.
 */
const readLimit = rateLimit({ name: "message-read", ...RATE_LIMIT_READ });
const sendLimit = rateLimit({ name: "message-send", ...RATE_LIMIT_MESSAGE_WRITE });
const markReadLimit = rateLimit({ name: "message-mark-read", ...RATE_LIMIT_MESSAGE_WRITE });

/**
 * UNCACHED, every route. Messages are the most viewer-specific and the most
 * frequently changing reads in this API - each one is somebody's private chat,
 * and each send changes two people's lists at once. A cache here would spend
 * its whole life being invalidated, and the real-time socket already delivers
 * changes the moment they happen.
 *
 * Order per route: requireAuth (above) -> rateLimit -> validate.
 */
router.get("/", readLimit, validate({ query: paginationQuerySchema }), list);
router.get("/unread-count", readLimit, unreadCount);

router.get(
  "/with/:userId/messages",
  readLimit,
  validate({ params: conversationUserParamSchema, query: messageHistoryQuerySchema }),
  history,
);
router.post(
  "/with/:userId/messages",
  sendLimit,
  validate({ params: conversationUserParamSchema, body: sendMessageSchema }),
  send,
);
router.post(
  "/with/:userId/read",
  markReadLimit,
  validate({ params: conversationUserParamSchema }),
  markRead,
);

export default router;
