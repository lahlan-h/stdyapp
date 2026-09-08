import { prisma } from "@stdyapp/core";

/**
 * Every read and every write here is scoped by userId, and on this table that
 * scoping is doing more work than it does for goals or streaks.
 *
 * A notification id is NOT self-authorising the way a (userId, period) pair is:
 * ids are handed out in list responses, and a client that learns one belonging
 * to someone else must not be able to mark it read or delete it. So the
 * single-row writes below take the userId as well and use deleteMany/updateMany,
 * which apply the WHERE to both columns at once. That makes the scoping part of
 * the statement rather than a check a caller has to remember to perform first.
 */

/**
 * Builds the WHERE for the list and its count so the two cannot disagree.
 *
 * They MUST agree: the total drives the client's page count, and computing it
 * from a different filter than the rows would produce a paginator that pages
 * into emptiness. Sharing one builder is what guarantees it.
 *
 * `unreadOnly` is undefined when not asked for - see the note in
 * notification.validation.js - so the isRead key is added rather than set to
 * undefined, keeping the object free of a no-op filter.
 */
const buildWhere = (userId, unreadOnly) => {
  const where = { userId };
  if (unreadOnly) where.isRead = false;
  return where;
};

export const createNotification = ({ userId, type, message }) => {
  return prisma.notification.create({ data: { userId, type, message } });
};

/**
 * One page of a user's notifications, newest first, with the total alongside.
 *
 * $transaction rather than two awaits, matching findAllFollows: the rows and
 * the count are read at one point in time, so a notification arriving between
 * them cannot produce a total that disagrees with the page.
 *
 * @returns {Promise<[Array<object>, number]>}
 */
export const findNotificationsByUser = ({ userId, unreadOnly, skip, take }) => {
  const where = buildWhere(userId, unreadOnly);

  return prisma.$transaction([
    prisma.notification.findMany({
      where,
      // createdAt then id. The tiebreak is not decorative: two notifications
      // raised in the same millisecond - entirely possible, since one event can
      // fan out to several - would otherwise have no defined order, and a row
      // could appear on both page 1 and page 2 or on neither.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.notification.count({ where }),
  ]);
};

// The badge. Served by its own route because a client polls it far more often
// than it opens the list, and counting an index is much cheaper than reading a
// page of rows to discard them.
export const countUnreadByUser = (userId) => {
  return prisma.notification.count({ where: { userId, isRead: false } });
};

/**
 * Marks one notification read.
 *
 * updateMany rather than update, for two reasons at once. It applies the userId
 * to the WHERE, so a caller cannot touch someone else's row - see the note at
 * the top of this file. And it does not throw when nothing matches, so marking
 * an already-read or already-deleted notification is a quiet no-op rather than
 * a P2025 the error middleware would render as a 500.
 *
 * The service reads the count to tell "not yours / gone" from "done", which is
 * what lets it still answer 404 where that is the truthful response.
 *
 * @returns {Promise<{ count: number }>}
 */
export const markNotificationRead = (id, userId) => {
  return prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true },
  });
};

/**
 * Marks everything read.
 *
 * The isRead:false in the WHERE is a filter, not a formality - without it this
 * rewrites every row the user has ever received on every call, which for a busy
 * account is a large write to change nothing.
 *
 * @returns {Promise<{ count: number }>}
 */
export const markAllNotificationsRead = (userId) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};

/**
 * Dismisses one notification. deleteMany for markNotificationRead's two
 * reasons: it scopes on userId, and it tolerates a repeat call.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteNotification = (id, userId) => {
  return prisma.notification.deleteMany({ where: { id, userId } });
};

/**
 * Clears the whole list.
 *
 * No ownership check needed here or in the service, for the reason
 * deleteMyFollows gives: userId is always the caller's own id from the access
 * token, so the WHERE clause IS the authorisation. The route must never accept
 * a target id from the path or body - there is no admin role in this codebase,
 * so a caller-supplied id would let anyone empty anyone else's notifications.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteNotificationsByUser = (userId) => {
  return prisma.notification.deleteMany({ where: { userId } });
};
