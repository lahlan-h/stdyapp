import { prisma } from "@stdyapp/core";

import { verifyAccessToken } from "../services/token.service.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Populates req.user from a Bearer access token.
 *
 * Unlike validate.js - which answers 400 directly because it carries per-field
 * detail the error middleware has nowhere to put - this calls next(err). A 401
 * has no such payload, so the error middleware in index.js renders it correctly
 * as-is, and gets to set res.locals.errorSummary for requestLogger on the way
 * through. That is why an unauthenticated request shows up as one WARN line
 * rather than an unexplained number.
 */

// Fields every authenticated handler can rely on. An explicit select, matching
// USER_PUBLIC_SELECT in user.service.js: passwordHash must never be loaded on
// the hot path where it would sit in req.user for the life of the request.
const AUTH_USER_SELECT = {
  id: true,
  username: true,
  email: true,
};

const MISSING_TOKEN = "Authentication required";
const UNKNOWN_USER = "Invalid access token";

/**
 * Pulls the token out of an Authorization header.
 *
 * The scheme is compared case-insensitively - RFC 7235 defines it as
 * case-insensitive, and clients do send "bearer".
 *
 * @param {import("express").Request} req
 * @returns {string | null} the token, or null when absent or malformed
 */
const extractBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;

  return token.trim() || null;
};

/**
 * Loads the user named by a verified token.
 *
 * The database round trip is deliberate. Trusting the JWT body alone would be
 * one less query, but a deleted or banned account would keep working until its
 * access token expired. This is a single lookup on the primary key.
 *
 * @param {string} token
 * @returns {Promise<{ id: string, username: string, email: string }>}
 * @throws {HttpError} 401 if the token is bad or the user no longer exists
 */
const resolveUser = async (token) => {
  const claims = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: AUTH_USER_SELECT,
  });

  // Valid signature, but the account is gone. 401 rather than 404: the token is
  // what is being rejected, and the caller is not authenticated.
  if (!user) throw new HttpError(401, UNKNOWN_USER);

  return user;
};

/**
 * Rejects the request unless it carries a valid access token.
 *
 * @type {import("express").RequestHandler}
 */
export const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) throw new HttpError(401, MISSING_TOKEN);

    req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Attaches req.user when a valid token is present, and continues without one
 * otherwise.
 *
 * For endpoints that serve both audiences - group search, say, where a logged-in
 * user should see which groups they have already joined and an anonymous
 * visitor should still get results.
 *
 * Note the asymmetry: a MISSING header is fine, but a PRESENT and invalid one
 * still fails. Silently ignoring a bad token would let an expired session look
 * like a deliberate anonymous browse, and the user would never be told to log
 * in again.
 *
 * @type {import("express").RequestHandler}
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (token) req.user = await resolveUser(token);
    next();
  } catch (err) {
    next(err);
  }
};
