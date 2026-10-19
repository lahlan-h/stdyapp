import { HttpError } from "../utils/httpError.js";
import { canViewPost, canViewUser } from "../services/privacy.service.js";

/**
 * Route gates for private accounts - see privacy.service.js for the rule.
 *
 * MIDDLEWARE, AND MOUNTED BEFORE cache(), which is the whole reason these are
 * not checks inside the handlers. cache() answers a hit without calling the
 * handler at all, so a check there would run only on a miss: the first allowed
 * viewer would fill the entry, and every stranger after them would be served
 * it. Ahead of the cache, only viewers who pass ever reach an entry - and since
 * everyone who passes is owed the same body, the existing keys, which carry no
 * viewer, stay correct.
 *
 * After validate(), so a malformed id is still the 400 that says so.
 */

/**
 * 403 unless the caller may see this user's activity.
 *
 * 403 rather than 404: the account's existence is not a secret - its profile
 * header is open - and the app shows a lock for exactly this answer. NOT 401,
 * which the app would read as an expired token and retry.
 *
 * @param {(req: import("express").Request) => string} resolveUserId - the
 *   route's own resolver, so "me" means the caller here exactly as it does in
 *   the handler and the cache key
 * @returns {import("express").RequestHandler}
 */
export const requireCanViewUser = (resolveUserId) => async (req, res, next) => {
  try {
    if (await canViewUser(req.user.id, resolveUserId(req))) return next();
    next(new HttpError(403, "This account is private"));
  } catch (err) {
    next(err);
  }
};

/**
 * 404 unless the caller may see this post - the same answer as a post that
 * does not exist, so a hidden one cannot be told apart from a missing one.
 *
 * @param {(req: import("express").Request) => string} resolvePostId
 * @returns {import("express").RequestHandler}
 */
export const requirePostVisible = (resolvePostId) => async (req, res, next) => {
  try {
    if (await canViewPost(req.user.id, resolvePostId(req))) return next();
    next(new HttpError(404, "Post not found"));
  } catch (err) {
    next(err);
  }
};
