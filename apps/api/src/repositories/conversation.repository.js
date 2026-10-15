import { prisma } from "@stdyapp/core";

/**
 * Every read here starts from a person, and every write is scoped to the pair
 * of people a conversation is between - so there is no query in this file that
 * can reach a conversation the caller is not in. The service passes the caller's
 * own id from the token; nothing here takes a conversation id from a client.
 */

/**
 * Who a message or a conversation row names: their name and their face. The
 * same allowlist the feed's author join uses - a select, never `user: true`,
 * which would put an email address on the other person's screen.
 */
export const USER_SUMMARY_SELECT = {
  select: {
    id: true,
    username: true,
    firstName: true,
    lastName: true,
    avatarUrl: true,
  },
};

const MESSAGE_SELECT = {
  id: true,
  body: true,
  senderId: true,
  createdAt: true,
};

/**
 * The identity of a 1:1 conversation: both ids, SORTED, so A-to-B and B-to-A
 * name the same row. The @unique on pairKey is what then makes "one
 * conversation per pair" a database guarantee rather than a hope.
 */
export const pairKeyOf = (userA, userB) => [userA, userB].sort().join(":");

/**
 * A conversation still has someone on the other side. A member row cascades
 * away when its account is deleted, leaving a conversation with one member;
 * this keeps such a conversation out of the list AND out of the badge count,
 * which must agree - a badge counting a chat the list cannot show would be a
 * number nobody can clear.
 */
const hasOtherMember = (userId) => ({
  members: { some: { userId: { not: userId } } },
});

export const findConversationByPair = (pairKey) => {
  return prisma.conversation.findUnique({
    where: { pairKey },
    select: { id: true },
  });
};

/**
 * Writes one message, creating the conversation on the first one.
 *
 * ONE interactive transaction, because every step below has to agree with the
 * others: a message that landed without the recipient's unread count moving
 * would never light their badge, and a count that moved without a message
 * would light it for nothing.
 *
 *   1. the conversation, by pairKey - created with both members on the first
 *      message, otherwise just stamped with lastMessageAt;
 *   2. the message;
 *   3. the recipient's unread count goes up;
 *   4. the sender's goes to zero - replying is the clearest sign of having read.
 *
 * The members are upserted rather than updated so a conversation that somehow
 * lost a member row (an account deleted and its id never reused - but still)
 * repairs itself instead of failing every send.
 *
 * A first message from both sides at the same instant can race on the pairKey
 * unique and throw P2002; the service retries the whole call once, at which
 * point the conversation exists and the upsert takes its update branch.
 *
 * @returns {Promise<{ conversationId: string, message: object, members: object[] }>}
 */
export const createMessage = ({ senderId, recipientId, body }) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const pairKey = pairKeyOf(senderId, recipientId);

    const conversation = await tx.conversation.upsert({
      where: { pairKey },
      create: {
        pairKey,
        lastMessageAt: now,
        members: { create: [{ userId: senderId }, { userId: recipientId }] },
      },
      update: { lastMessageAt: now },
      select: { id: true },
    });
    const conversationId = conversation.id;

    // createdAt set explicitly to the same instant as lastMessageAt, so the
    // list's sort column and the message it points at can never disagree.
    const message = await tx.message.create({
      data: { conversationId, senderId, body, createdAt: now },
      select: MESSAGE_SELECT,
    });

    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: recipientId } },
      create: { conversationId, userId: recipientId, unreadCount: 1 },
      update: { unreadCount: { increment: 1 } },
    });
    await tx.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      create: { conversationId, userId: senderId, lastReadAt: now },
      update: { unreadCount: 0, lastReadAt: now },
    });

    const members = await tx.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true, unreadCount: true, user: USER_SUMMARY_SELECT },
    });

    return { conversationId, message, members };
  });
};

/**
 * One page of a person's conversations, most recently active first.
 *
 * Read through the MEMBER table, because that is where "mine" and "my unread
 * count" live; the conversation and its newest message come along in the same
 * query. Only conversations with at least one message (lastMessageAt set) and
 * someone still on the other side are listed.
 *
 * The conversationId tiebreak is load-bearing for the reason it is on the feed:
 * two conversations last active in the same millisecond have no defined order,
 * and under OFFSET pagination one could appear on two pages or on none.
 *
 * @returns {Promise<[object[], number]>}
 */
export const findConversationsForUser = ({ userId, skip, take }) => {
  const where = {
    userId,
    conversation: { lastMessageAt: { not: null }, ...hasOtherMember(userId) },
  };

  return prisma.$transaction([
    prisma.conversationMember.findMany({
      where,
      orderBy: [{ conversation: { lastMessageAt: "desc" } }, { conversationId: "asc" }],
      skip,
      take,
      select: {
        unreadCount: true,
        conversation: {
          select: {
            id: true,
            lastMessageAt: true,
            members: {
              where: { userId: { not: userId } },
              select: { user: USER_SUMMARY_SELECT },
            },
            messages: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: MESSAGE_SELECT,
            },
          },
        },
      },
    }),
    prisma.conversationMember.count({ where }),
  ]);
};

/**
 * The badge: how many PEOPLE have messages this person has not read. One row
 * per conversation, so counting rows with unreadCount > 0 counts people, which
 * is what the Home panel shows - three texts from one friend are one reply owed.
 * Served by @@index([userId, unreadCount]).
 */
export const countUnreadConversations = (userId) => {
  return prisma.conversationMember.count({
    where: { userId, unreadCount: { gt: 0 }, conversation: hasOtherMember(userId) },
  });
};

/**
 * The message a `before` cursor names - but only if it is in THIS
 * conversation. Looked up scoped rather than trusted, which is why history does
 * not use Prisma's own `cursor`: that would happily start from a message id
 * belonging to some other conversation entirely.
 */
export const findMessageInConversation = (conversationId, messageId) => {
  return prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, createdAt: true },
  });
};

/**
 * One page of history, newest first, older than `cursor` when one is given.
 *
 * "Older" is the (createdAt, id) pair compared lexically, matching the order -
 * a cursor on createdAt alone would skip a message that shares its millisecond.
 * Asks for one more row than the page so the service can say whether there is
 * anything left without a second count query.
 */
export const findHistory = ({ conversationId, cursor, take }) => {
  const olderThanCursor = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};

  return prisma.message.findMany({
    where: { conversationId, ...olderThanCursor },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: MESSAGE_SELECT,
  });
};

/**
 * Marks one person's side of a conversation read.
 *
 * The unreadCount > 0 filter makes it report whether anything CHANGED, which is
 * what decides whether the person's other devices need telling - re-reading an
 * already-read chat is a no-op that must not fan out an event.
 *
 * @returns {Promise<{ count: number }>}
 */
export const markConversationRead = (conversationId, userId) => {
  return prisma.conversationMember.updateMany({
    where: { conversationId, userId, unreadCount: { gt: 0 } },
    data: { unreadCount: 0, lastReadAt: new Date() },
  });
};
