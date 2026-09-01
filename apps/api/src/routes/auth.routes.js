import { Router } from "express";

import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "../validation/auth.validation.js";

const router = Router();

/**
 * /api/auth
 *
 * Same two mandatory wrappers as users.routes.js - validate() first so every
 * controller can assume req.validated, then asyncHandler() because Express 4
 * ignores the promise an async handler returns and a throw would otherwise hang
 * the request instead of reaching the error middleware.
 *
 * Most of these are PUBLIC, and that is correct: register and login create the
 * credential, refresh presents the refresh token AS the credential, and logout
 * must work for a client whose access token has already expired.
 */
router.post(
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(register),
);

router.post("/login", validate({ body: loginSchema }), asyncHandler(login));

router.post(
  "/refresh",
  validate({ body: refreshTokenSchema }),
  asyncHandler(refresh),
);

router.post(
  "/logout",
  validate({ body: refreshTokenSchema }),
  asyncHandler(logout),
);

// The two that genuinely need an access token: both act on the caller's own
// account rather than on a token they are holding.
router.post("/logout-all", requireAuth, asyncHandler(logoutAll));

router.get("/me", requireAuth, asyncHandler(me));

export default router;
