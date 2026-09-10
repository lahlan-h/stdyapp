import { Router } from "express";
import {
  listMine,
  getUnreadCount,
  markRead,
  markAllRead,
  remove,
  clearMine,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import {
  notificationIdParamSchema,
  listNotificationsQuerySchema,
} from "../validation/notification.validation.js";
import { notificationUserVersionKey, notificationUnreadKey } from "../utils/cache.js";
import {
  CACHE_TTL_NOTIFICATION_COUNT_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_NOTIFICATION_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

router.use(requireAuth);

/**
 * Three buckets, all keyed on req.user.id and all in the notification keyspace.
 *
 * writeLimit uses the 60/min tier rather than the 20/min one, because marking a
 * notification read is a tap and a user clearing a backlog legitimately fires a
 * burst - see config/cache.js.
 *
 * bulkLimit sits on DELETE / alone. That one is bulk by row count as well as by
 * irreversibility: it deletes the caller's entire history with nothing to
 * restore it from. DELETE /:id stays on writeLimit - one row, dismissed
 * deliberately, and a user working through a list will do it repeatedly.
 */
const readLimit = rateLimit({ name: "notification-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({
  name: "notification-write",
  ...RATE_LIMIT_NOTIFICATION_WRITE,
});
const bulkLimit = rateLimit({ name: "notification-bulk", ...RATE_LIMIT_BULK });

/**
 * The unread badge - the ONE cached read in this router.
 *
 * The paginated list below is deliberately uncached, matching GET /all in the
 * post, like, comment and follow routers: every notification this user receives
 * would invalidate every page of it, and the key would have to carry page,
 * limit and unreadOnly. See notificationUnreadKey.
 */
const cacheUnread = cache({
  ttlSec: CACHE_TTL_NOTIFICATION_COUNT_SEC,
  versionKeys: (req) => [notificationUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => notificationUnreadKey(req.user.id, version),
});

/**
 * ⚠ ROUTE ORDER IS LOAD-BEARING for the two literal paths here.
 *
 * "/unread-count" and "/read-all" are single-segment literals, so they would be
 * shadowed by a single-segment "/:id" route if one were ever added below them.
 * None exists today - notifications are read as a list, never one at a time -
 * but if a GET /:id is added, it MUST go after /unread-count or the literal
 * becomes an unreachable 400 from the uuid check.
 *
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache, as everywhere else.
 */

router.get(
  "/",
  readLimit,
  validate({ query: listNotificationsQuerySchema }),
  listMine,
);

router.get("/unread-count", readLimit, cacheUnread, getUnreadCount);

// No body schema, matching POST /api/routines/:id/clone: the route carries no
// payload at all, and the action is fully described by its path.
router.post("/read-all", writeLimit, markAllRead);

router.patch(
  "/:id/read",
  writeLimit,
  validate({ params: notificationIdParamSchema }),
  markRead,
);

router.delete(
  "/:id",
  writeLimit,
  validate({ params: notificationIdParamSchema }),
  remove,
);

// Declared last, and deliberately: a bare DELETE on the collection root is the
// most destructive call in this router, and putting it at the bottom keeps it
// from being read as the default case for the routes above it.
router.delete("/", bulkLimit, clearMine);

export default router;
