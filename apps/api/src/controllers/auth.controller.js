import * as authService from "../services/auth.service.js";
import * as userService from "../services/user.service.js";

/**
 * Auth endpoints. Thin, matching users.controller.js: status codes and response
 * shape only, no policy.
 *
 * Tokens are returned in the JSON BODY rather than set as cookies. There is no
 * browser client yet, the mobile app cannot use cookies at all, and a
 * cookie-based flow would need CSRF protection this API does not have. A client
 * stores the refresh token in secure storage and sends it explicitly.
 */

/**
 * Serialises a token pair for the wire.
 *
 * expiresAt is the REFRESH token's expiry - the access token carries its own
 * exp claim, which the client can read. Sending both would invite confusion
 * about which one is about to run out.
 *
 * @param {{ accessToken: string, refreshToken: string, expiresAt: Date }} tokens
 * @returns {object}
 */
const toTokenPayload = (tokens) => ({
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  tokenType: "Bearer",
  refreshTokenExpiresAt: tokens.expiresAt.toISOString(),
});

/**
 * POST /api/auth/register - creates an account and logs it in.
 * 201 on success, 409 on a duplicate email/username, 400 on a bad body.
 */
export const register = async (req, res) => {
  const { user, tokens } = await authService.register(
    req.validated.body,
    req.get("user-agent"),
  );

  res.status(201).json({ data: { user, ...toTokenPayload(tokens) } });
};

/**
 * POST /api/auth/login - 200 with a token pair, 401 on bad credentials.
 */
export const login = async (req, res) => {
  const { user, tokens } = await authService.login(
    req.validated.body,
    req.get("user-agent"),
  );

  res.status(200).json({ data: { user, ...toTokenPayload(tokens) } });
};

/**
 * POST /api/auth/refresh - swaps a refresh token for a fresh pair.
 *
 * Public: the refresh token IS the credential here, so requiring an access
 * token as well would defeat the purpose - a client refreshes precisely because
 * its access token has expired.
 */
export const refresh = async (req, res) => {
  const tokens = await authService.refresh(
    req.validated.body.refreshToken,
    req.get("user-agent"),
  );

  res.status(200).json({ data: toTokenPayload(tokens) });
};

/**
 * POST /api/auth/logout - revokes the presented refresh token. 204, always.
 *
 * Public and idempotent by design: a client whose access token has already
 * expired must still be able to log out, and an unauthenticated caller must not
 * learn whether a token existed.
 */
export const logout = async (req, res) => {
  await authService.logout(req.validated.body.refreshToken);
  res.status(204).end();
};

/**
 * POST /api/auth/logout-all - ends every session for the current user.
 * Requires auth: it acts on the caller's whole account.
 */
export const logoutAll = async (req, res) => {
  const revoked = await authService.logoutAll(req.user.id);
  res.status(200).json({ data: { sessionsEnded: revoked } });
};

/**
 * GET /api/auth/me - the current user.
 *
 * Re-read through userService rather than returning req.user, so this responds
 * with exactly the same shape as GET /api/users/:id. requireAuth only loads the
 * three fields it needs.
 */
export const me = async (req, res) => {
  const user = await userService.getUserById(req.user.id);
  res.status(200).json({ data: user });
};
