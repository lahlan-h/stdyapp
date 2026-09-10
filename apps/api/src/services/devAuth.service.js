import crypto from "node:crypto";

import { prisma } from "@stdyapp/core";

import * as userService from "./user.service.js";
import * as tokenService from "./token.service.js";

/**
 * DEVELOPMENT ONLY. Mints an access token with no credentials at all.
 *
 * Every file in this feature is named devAuth.* so that
 * `grep -rn devAuth apps/api/src` returns the complete dev surface in one
 * command - for a reviewer checking what is exposed, and for whoever eventually
 * deletes it.
 *
 * Nothing here checks NODE_ENV. The gate lives at the two places that decide
 * whether this code is reachable at all - the conditional mount in
 * routes/index.js and the guard in devAuth.controller.js - because a module
 * that gates itself is a module someone can import and call anyway.
 */

// A dedicated account rather than any real user's. The whole point of the route
// is a token that is nobody's: this one exists solely so that requireAuth has a
// row to find.
const DEV_EMAIL = "dev@stdyapp.local";
const DEV_USERNAME = "dev_local";

/**
 * @returns {Promise<{ id: string, username: string } | null>}
 */
const findDevUser = () =>
  prisma.user.findUnique({
    where: { email: DEV_EMAIL },
    select: { id: true, username: true },
  });

/**
 * Returns the dev account, creating it on first use.
 *
 * Creation goes through userService.createUser rather than prisma.user.create
 * so bcrypt's cost factor and the field allowlist stay defined in exactly one
 * place - the same reasoning auth.service.js gives for delegating registration
 * there ("Two hashing call sites would be two places to get the cost factor
 * wrong").
 *
 * The password is 32 random bytes that are generated here, hashed, and then
 * dropped on the floor. Nobody - including us - ever learns it. That is
 * deliberate and load-bearing: it means POST /api/auth/login cannot reach this
 * account, so the only door to it is a route that exists only in development.
 *
 * @returns {Promise<{ id: string, username: string }>}
 */
export const getOrCreateDevUser = async () => {
  const existing = await findDevUser();
  if (existing) return existing;

  try {
    return await userService.createUser({
      email: DEV_EMAIL,
      username: DEV_USERNAME,
      password: crypto.randomBytes(32).toString("base64url"),
      firstName: "Dev",
      lastName: "Local",
    });
  } catch (err) {
    // Two first-ever calls racing: one wins, the other gets a 409 from the
    // unique index (P2002, mapped by userService). The account it wanted now
    // exists, so re-read rather than surfacing a conflict for what is really a
    // success. Any other failure is real and propagates.
    if (err.status !== 409) throw err;

    const raced = await findDevUser();
    if (!raced) throw err;

    return raced;
  }
};

/**
 * Issues a bare access token for the dev account.
 *
 * Access token ONLY, no pair. signAccessToken is synchronous and stateless, so
 * calling this a hundred times writes nothing to the database and leaves no
 * refresh_tokens rows to clean up afterwards. The TTL is the standard 15
 * minutes - re-running one curl is cheaper than a special long-lived token
 * that would outlive the shell it was made for.
 *
 * @returns {Promise<{ user: { id: string, username: string }, accessToken: string }>}
 */
export const issueDevAccessToken = async () => {
  const user = await getOrCreateDevUser();

  return { user, accessToken: tokenService.signAccessToken(user) };
};
