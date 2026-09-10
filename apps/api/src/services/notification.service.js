import { createLogger } from "@stdyapp/core";

import * as notificationRepo from "../repositories/notification.repository.js";
import { HttpError } from "../utils/httpError.js";
import { bumpVersions, notificationUserVersionKey } from "../utils/cache.js";

const log = createLogger("notifications");

const notFound = () => new HttpError(404, "Notification not found");

/**
 * Invalidates this module's cached read.
 *
 * ONE counter per user, where sessions and routines each need two. That falls
 * out of the shape of the entity rather than being an omission: only ONE read
 * in this router is cached - the unread badge - and every write below can move
 * it. There is no per-notification payload to orphan because there is no
 * GET /:id, and the paginated list is deliberately uncached (see
 * listMyNotifications).
 *
 * Awaited rather than fired and forgotten, and always AFTER the database write
 * resolves - bumping first lets a reader observe the new version, query the
 * not-yet-committed row and cache the OLD count under the NEW key, where it
 * would sit for the whole TTL.
 */
const invalidateNotifications = async (userId) => {
  await bumpVersions([notificationUserVersionKey(userId)]);
};

/**
 * Raises a notification. THE ONLY WRITER of this table.
 *
 * No route reaches this function. It is exported for other SERVICES to call
 * when something notification-worthy happens - streak.service.js and
 * goal.service.js do today, and the follow, like and comment services are the
 * obvious next callers. See the NotificationType comment in schema.prisma for
 * the values already reserved for them.
 *
 * ⚠ NEVER THROWS, and that is a deliberate design decision rather than sloppy
 * error handling. This runs on the tail of some other operation that has
 * ALREADY committed - a session has ended, a streak has advanced - and failing
 * to tell someone about it is not a reason to fail the thing that happened. A
 * caller must not have to wrap every call site in a try/catch to be safe, and
 * an unhandled rejection would terminate the process on modern Node.
 *
 * The consequence to be aware of: a caller cannot tell whether this succeeded.
 * That is fine for notifications and would NOT be fine for anything a user is
 * owed, so nothing that matters may be routed through here.
 *
 * SELF-NOTIFICATION IS NOT FILTERED HERE. It cannot be: this function sees only
 * a recipient, not an actor, so it has nothing to compare. The caller is
 * responsible for not telling someone that they liked their own post - see the
 * guard in the follow/like/comment services when they are wired up.
 *
 * @param {{ userId: string, type: string, message: string }} input
 * @returns {Promise<object | null>} the row, or null if it could not be written
 */
export const emitNotification = async ({ userId, type, message }) => {
  try {
    const notification = await notificationRepo.createNotification({
      userId,
      type,
      message,
    });

    await invalidateNotifications(userId);

    return notification;
  } catch (err) {
    // WARN rather than ERROR: the user-visible operation succeeded, and this is
    // a degraded outcome rather than a failure. Logged with the recipient and
    // type so a systematic problem is diagnosable from the log alone.
    log.warn(`failed to emit ${type} notification for ${userId}: ${err?.message}`);
    return null;
  }
};

/**
 * One page of the caller's notifications.
 *
 * DELIBERATELY UNCACHED, matching GET /all in the post, like, comment and
 * follow routers and the paginated directory in users. Two reasons compound
 * here: every notification write for this user would invalidate every page of
 * it, and the key would have to carry page, limit and unreadOnly - so the cache
 * would thrash and grow at once. The unread COUNT is the read worth caching,
 * and it has its own route.
 *
 * No ownership check, and none is needed: userId is the caller's own id from
 * the access token, so the WHERE clause is the authorisation.
 *
 * @returns {Promise<{ items: object[], total: number, page: number, limit: number }>}
 */
export const listMyNotifications = async ({ userId, page, limit, unreadOnly }) => {
  const [items, total] = await notificationRepo.findNotificationsByUser({
    userId,
    unreadOnly,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/** The badge. The one cached read in this router. */
export const getUnreadCount = async (userId) => {
  const unread = await notificationRepo.countUnreadByUser(userId);
  return { unread };
};

/**
 * Marks one notification read.
 *
 * The repository scopes the update on userId as well as id, so a caller holding
 * someone else's notification id changes nothing and lands in the branch below.
 *
 * A count of 0 means one of three things - the id does not exist, it belongs to
 * someone else, or it was already read - and this answers 404 for all of them.
 * Collapsing the first two is deliberate: distinguishing them would confirm
 * that a given id exists to someone who cannot read it, the enumeration oracle
 * requireSelf.js takes care to avoid.
 *
 * Collapsing the THIRD into the same 404 is the arguable one. It makes the
 * route non-idempotent for a double tap, which is a real cost - but the
 * alternative is answering 200 for an id the caller may not own, which would
 * hand back exactly the information the WHERE clause exists to withhold.
 */
export const markRead = async (id, userId) => {
  const result = await notificationRepo.markNotificationRead(id, userId);
  if (result.count === 0) throw notFound();

  await invalidateNotifications(userId);

  return { id, isRead: true };
};

/**
 * Marks everything read. Idempotent, and safe to call on an empty list.
 *
 * @returns {Promise<{ count: number }>}
 */
export const markAllRead = async (userId) => {
  const result = await notificationRepo.markAllNotificationsRead(userId);

  // Nothing changed, so nothing is stale. Saves a Redis round trip on the
  // repeat call this idempotent route is designed to tolerate - the same guard
  // deleteMyFollows uses.
  if (result.count === 0) return result;

  await invalidateNotifications(userId);

  return result;
};

/**
 * Dismisses one notification.
 *
 * 404 on a miss for markRead's reasons, minus the third: there is no
 * "already deleted" state to be lenient about that is not also "does not
 * exist".
 */
export const dismissNotification = async (id, userId) => {
  const result = await notificationRepo.deleteNotification(id, userId);
  if (result.count === 0) throw notFound();

  await invalidateNotifications(userId);

  return result;
};

/**
 * Clears the caller's whole list.
 *
 * On RATE_LIMIT_BULK in the router, and unlike DELETE /:id this one is
 * genuinely bulk by row count. Irreversible, which is the property that tier
 * exists for.
 *
 * @returns {Promise<{ count: number }>}
 */
export const clearMyNotifications = async (userId) => {
  const result = await notificationRepo.deleteNotificationsByUser(userId);

  if (result.count === 0) return result;

  await invalidateNotifications(userId);

  return result;
};
