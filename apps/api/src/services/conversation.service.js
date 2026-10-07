import { createLogger } from "@stdyapp/core";

import * as conversationRepo from "../repositories/conversation.repository.js";
// The REPOSITORY, never block.service.js - for the import-cycle reason
// follow.service.js gives. block.service.js reaches into other services.
import { findBlockBetween } from "../repositories/block.repository.js";
// The only sanctioned way to reach prisma.user from a service - see post.service.js.
import { getUserById } from "./user.service.js";
import { HttpError } from "../utils/httpError.js";
import { isPrismaError } from "../utils/prismaError.js";
import { publishNotificationEvent } from "../realtime/notificationBus.js";

const log = createLogger("conversations");

/**
 * AUTHORIZATION MODEL
 *
 * A conversation is private to its two members, and nothing in this module
 * takes a conversation id from a client: every route names the OTHER person,
 * and the conversation is found from the pair (caller from the token, other
 * from the path). There is no way to ask about a conversation you are not in,
 * because there is no way to name one.
 *
 * Who may message whom: ANYONE, except across a block in either direction -
 * the rule follows already apply. Reading existing history is not gated on
 * blocks: it is a record of what both people already said to each other, and
 * hiding it would not unsay it.
 *
 * Self-messaging is refused, as self-following is.
 */

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

const badRequest = (message) => new HttpError(400, message);

/**
 * BYTE-IDENTICAL to getUserById's 404, and that is the point - see the block
 * check in sendMessage, where a blocked person must be told nothing that
 * distinguishes "they blocked you" from "no such account".
 */
const userNotFound = () => new HttpError(404, "User not found");

/**
 * A message as one particular reader sees it.
 *
 * `isMine` rather than the sender's id, for the reason posts carry isMine: the
 * app does not know who it is signed in as, and does not need to - which side
 * of the chat a bubble sits on is the only thing it does with the answer.
 */
const toMessage = (row, viewerId) => ({
  id: row.id,
  body: row.body,
  createdAt: row.createdAt,
  isMine: row.senderId === viewerId,
});

/**
 * The caller's conversations, most recently active first.
 *
 * @returns {Promise<{ items: object[], total: number, page: number, limit: number }>}
 */
export const listConversations = async ({ userId, page, limit }) => {
  const [rows, total] = await conversationRepo.findConversationsForUser({
    userId,
    skip: (page - 1) * limit,
    take: limit,
  });

  // The repository already excludes conversations with nobody on the other
  // side; the guard here only keeps a row that lost its other member between
  // the two halves of that read from reaching the client half-formed.
  const items = rows.flatMap(({ unreadCount, conversation }) => {
    const other = conversation.members[0]?.user;
    const last = conversation.messages[0];
    if (!other || !last) return [];
    return [
      {
        user: other,
        lastMessage: toMessage(last, userId),
        unreadCount,
        lastMessageAt: conversation.lastMessageAt,
      },
    ];
  });

  return { items, total, page, limit };
};

/** The badge: how many people have unread messages for the caller. */
export const getUnreadConversationCount = async (userId) => {
  const unread = await conversationRepo.countUnreadConversations(userId);
  return { unread };
};

/**
 * One page of the caller's history with another person, newest first.
 *
 * No conversation yet is not an error: it is an empty chat, which is exactly
 * what the app shows when someone taps Message on a profile for the first time.
 * An unknown PERSON, though, is a 404, so a bad id is not mistaken for a quiet
 * friendship.
 *
 * @returns {Promise<{ items: object[], hasMore: boolean }>}
 */
export const getHistory = async ({ viewerId, otherUserId, before, limit }) => {
  if (viewerId === otherUserId) throw badRequest("You cannot message yourself");
  await getUserById(otherUserId);

  const conversation = await conversationRepo.findConversationByPair(
    conversationRepo.pairKeyOf(viewerId, otherUserId),
  );
  if (!conversation) {
    if (before) throw badRequest("before is not a message in this conversation");
    return { items: [], hasMore: false };
  }

  let cursor;
  if (before) {
    cursor = await conversationRepo.findMessageInConversation(conversation.id, before);
    // A 400 rather than an empty page: an id from another conversation is a
    // client bug, and answering it with "no older messages" would hide that.
    if (!cursor) throw badRequest("before is not a message in this conversation");
  }

  const rows = await conversationRepo.findHistory({
    conversationId: conversation.id,
    cursor,
    take: limit,
  });

  return {
    items: rows.slice(0, limit).map((row) => toMessage(row, viewerId)),
    hasMore: rows.length > limit,
  };
};

/**
 * Tells both people about a message that has just been written.
 *
 * Each gets their OWN view of it - the recipient sees who it is from, an
 * unread count that just went up, and their new badge total; the sender's other
 * devices see who it went to, with nothing unread. Same event name both ways,
 * because to the app both are simply "a message in this chat".
 *
 * NEVER THROWS, for emitNotification's reason: the message is already stored,
 * and failing to announce it is not a reason to tell the sender it failed. The
 * recipient's app reads the list again on its next socket connect regardless.
 */
const announceMessage = async ({ senderId, recipientId, message, members }) => {
  try {
    const sender = members.find((member) => member.userId === senderId);
    const recipient = members.find((member) => member.userId === recipientId);
    const [senderUnread, recipientUnread] = await Promise.all([
      conversationRepo.countUnreadConversations(senderId),
      conversationRepo.countUnreadConversations(recipientId),
    ]);

    await Promise.all([
      publishNotificationEvent(recipientId, {
        type: "message:created",
        with: sender?.user,
        message: toMessage(message, recipientId),
        unreadCount: recipient?.unreadCount ?? 1,
        unreadConversations: recipientUnread,
      }),
      publishNotificationEvent(senderId, {
        type: "message:created",
        with: recipient?.user,
        message: toMessage(message, senderId),
        unreadCount: 0,
        unreadConversations: senderUnread,
      }),
    ]);
  } catch (err) {
    log.warn(`failed to announce message ${message.id}: ${err?.message}`);
  }
};

/**
 * Sends one message, creating the conversation if this is the first.
 *
 * The block check follows followUser exactly, including its asymmetry: the
 * person who did the blocking is told plainly why, while the person who was
 * blocked gets the same 404 an unknown id would - anything else would be a
 * "you have been blocked" notification by another name.
 *
 * @returns {Promise<object>} the message as the sender sees it
 */
export const sendMessage = async ({ senderId, recipientId, body }) => {
  if (senderId === recipientId) throw badRequest("You cannot message yourself");

  // 404 for an unknown person, before the block check, so a bad id is a 404
  // about the id rather than one that quietly means something else.
  await getUserById(recipientId);

  const block = await findBlockBetween(senderId, recipientId);
  if (block) {
    if (block.blockerId === senderId) {
      throw badRequest("You cannot message someone you have blocked");
    }
    throw userNotFound();
  }

  const write = () => conversationRepo.createMessage({ senderId, recipientId, body });

  let result;
  try {
    result = await write();
  } catch (err) {
    // Both people sent their FIRST message in the same instant and raced on
    // the pairKey unique. The conversation exists now; this time it is found.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      result = await write();
    } else if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) {
      // The recipient's account was deleted between the check above and the
      // insert - the check was honest when it ran, so still a 404.
      throw userNotFound();
    } else {
      throw err;
    }
  }

  await announceMessage({
    senderId,
    recipientId,
    message: result.message,
    members: result.members,
  });

  return toMessage(result.message, senderId);
};

/**
 * Marks the caller's side of a conversation read, and returns their new badge.
 *
 * Idempotent and quiet: no conversation, or nothing unread, changes nothing
 * and announces nothing. When something did change, the caller's OTHER devices
 * are told, so a chat read on the phone stops counting on the tablet too.
 *
 * @returns {Promise<{ unread: number }>}
 */
export const markConversationRead = async ({ viewerId, otherUserId }) => {
  const conversation = await conversationRepo.findConversationByPair(
    conversationRepo.pairKeyOf(viewerId, otherUserId),
  );

  if (conversation) {
    const { count } = await conversationRepo.markConversationRead(conversation.id, viewerId);
    if (count > 0) {
      await publishNotificationEvent(viewerId, {
        type: "conversation:read",
        userId: otherUserId,
      });
    }
  }

  return getUnreadConversationCount(viewerId);
};
