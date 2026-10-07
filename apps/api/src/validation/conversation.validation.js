import { z } from "zod";

import { MAX_PAGE_SIZE } from "./pagination.validation.js";

/**
 * Request schemas for direct messages.
 *
 * Every route here is addressed by the OTHER person's id rather than by a
 * conversation id. A 1:1 conversation is the pair of people, nothing more, and
 * the app opens a chat from someone's profile before any conversation exists -
 * the first message creates it. See the Conversation model in schema.prisma.
 *
 * strictObject everywhere, per the convention user.validation.js sets: an
 * unrecognised key is a loud 400, never a silent no-op.
 */

/**
 * The longest message this API stores.
 *
 * Message.body is TEXT with no length constraint in Postgres, so this is the
 * only bound on it. The same 2000 as a comment: generous for a chat, and far
 * below anything that would hurt a list read. Exported because the app mirrors
 * it in its message box's maxLength.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * How much history one read returns, and the most it may ask for.
 *
 * Thirty fills a phone screen of bubbles with room to scroll; fifty caps a
 * page well below the API-wide MAX_PAGE_SIZE, because a chat is read a
 * screenful at a time and a larger page only delays the first bubble.
 */
export const DEFAULT_HISTORY_PAGE = 30;
export const MAX_HISTORY_PAGE = Math.min(50, MAX_PAGE_SIZE);

/** /with/:userId/... - the person on the other side of the conversation. */
export const conversationUserParamSchema = z.strictObject({
  userId: z.uuid("userId must be a UUID"),
});

/**
 * POST /with/:userId/messages.
 *
 * Trimmed BEFORE the length checks, so a message of spaces is empty rather than
 * one character long, and the stored text is what the person meant to send.
 */
export const sendMessageSchema = z.strictObject({
  body: z
    .string()
    .trim()
    .min(1, "message must not be empty")
    .max(MAX_MESSAGE_LENGTH, `message must be at most ${MAX_MESSAGE_LENGTH} characters`),
});

/**
 * GET /with/:userId/messages - one page of history, newest first.
 *
 * A CURSOR rather than a page number, unlike every other list in this API, and
 * for a reason those lists do not have: a conversation grows at its newest end
 * while it is being read. With offsets, a message arriving between "page 1" and
 * "page 2" shifts every row by one, and the second read repeats the oldest
 * bubble of the first. `before` names the oldest message the client already
 * holds, so the next page is "older than that" however many have arrived since.
 */
export const messageHistoryQuerySchema = z.strictObject({
  before: z.uuid("before must be a UUID").optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_HISTORY_PAGE)
    .default(DEFAULT_HISTORY_PAGE),
});
