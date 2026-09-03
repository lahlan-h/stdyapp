import * as devAuthService from "../services/devAuth.service.js";
import { isDevAuthEnabled } from "../config/auth.js";

/**
 * DEVELOPMENT ONLY. See devAuth.service.js.
 */

/**
 * POST /api/auth/dev-token - an access token for the dev account, no
 * credentials required.
 *
 * 200 with the token, or 404 anywhere that is not development.
 */
export const devToken = async (req, res, next) => {
  try {
    // Defence in depth. routes/index.js already declines to mount this router
    // outside development, so in a correct build this line is unreachable - it
    // is here to catch the future edit that mounts it unconditionally, which is
    // exactly the mistake that would be easy to make and catastrophic to ship.
    //
    // 404 rather than 403: a route that should not exist should be
    // indistinguishable from one that does not.
    if (!isDevAuthEnabled()) return res.status(404).json({ error: "Not found" });

    const { user, accessToken } = await devAuthService.issueDevAccessToken();

    // Same { data } envelope as the rest of /api/auth. The user is included so
    // a developer can copy the id straight into their next call rather than
    // decoding the token to find it.
    res.status(200).json({ data: { user, accessToken, tokenType: "Bearer" } });
  } catch (err) {
    next(err);
  }
};
