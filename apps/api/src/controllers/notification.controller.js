import * as notificationService from "../services/notification.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * There is no `create` here. Notifications are raised by other services through
 * emitNotification, never by a request - see notification.validation.js for why
 * a client-writable notification feed would be a phishing surface.
 */

export const listMine = async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.validated.query;

    const result = await notificationService.listMyNotifications({
      userId: req.user.id,
      page,
      limit,
      unreadOnly,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    res.status(200).json(count);
  } catch (err) {
    next(err);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const result = await notificationService.markRead(
      req.validated.params.id,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// 200 with the count rather than 204: "marked 12 as read" is worth showing, and
// a client that just cleared its badge wants to know whether anything moved.
export const markAllRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllRead(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await notificationService.dismissNotification(
      req.validated.params.id,
      req.user.id,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const clearMine = async (req, res, next) => {
  try {
    const result = await notificationService.clearMyNotifications(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
