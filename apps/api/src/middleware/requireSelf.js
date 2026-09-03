import { HttpError } from "../utils/httpError.js";

/**
 * Rejects unless the :id in the path is the authenticated caller's own user id.
 *
 * A middleware rather than a check inside the controller, for two reasons.
 * users.controller.js is deliberately thin - "status codes and response shape
 * only, no policy" - and putting the rule in the route chain means
 * users.routes.js reads as the COMPLETE access policy for the resource, with
 * nothing hidden a layer down where a reviewer might miss it.
 *
 * Authentication and authorisation are separate problems and this file only
 * solves the second: requireAuth establishes WHO the caller is, this decides
 * whether they may touch this particular row. Without it, locking the router
 * behind a token would only downgrade "anyone on the internet can delete any
 * account" to "anyone with an account can delete any account".
 *
 * MUST be mounted after requireAuth, which is what populates req.user. The
 * optional chain below means a mounting mistake fails closed with a 403 rather
 * than throwing on undefined.
 *
 * Answers 403 WITHOUT touching the database, so the response says nothing about
 * whether the target account exists. That keeps it from becoming the
 * account-enumeration oracle that user.service.js already takes care to avoid
 * by not letting listUsers search on email.
 *
 * @type {import("express").RequestHandler}
 */
export const requireSelf = (req, res, next) => {
  if (req.params.id !== req.user?.id) {
    return next(new HttpError(403, "You can only modify your own account"));
  }

  next();
};
