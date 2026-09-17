import { Router } from "express";

import {
  createSamples,
  getFocus,
  listSamples,
  rateSession,
  getBaselines,
} from "../controllers/focus.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  sessionIdParamSchema,
  createFocusSamplesSchema,
  focusRatingSchema,
  listSamplesQuerySchema,
} from "../validation/focus.validation.js";

/**
 * Focus-estimate routes.
 *
 * Split into TWO routers, and mounted separately in routes/index.js, because
 * they hang off different paths: the per-session ones extend /api/sessions,
 * which session.routes.js already owns, while the baseline is about the user.
 *
 * Keeping the session ones in their own router - rather than adding them to
 * session.routes.js - is what lets this whole feature ship without editing
 * another feature's route table. Express simply falls through to this router
 * when a path does not match one there.
 *
 * Both routers apply requireAuth at router level, exactly as session.routes.js
 * does: every route here reads or writes the caller's own data, so a route
 * added later is protected by default. That is the safe direction to fail.
 */

export const sessionFocusRouter = Router();

sessionFocusRouter.use(requireAuth);

sessionFocusRouter.post(
  "/:id/focus-samples",
  validate({ params: sessionIdParamSchema, body: createFocusSamplesSchema }),
  asyncHandler(createSamples),
);

sessionFocusRouter.get(
  "/:id/focus-samples",
  validate({ params: sessionIdParamSchema, query: listSamplesQuerySchema }),
  asyncHandler(listSamples),
);

sessionFocusRouter.get(
  "/:id/focus",
  validate({ params: sessionIdParamSchema }),
  asyncHandler(getFocus),
);

sessionFocusRouter.put(
  "/:id/focus-rating",
  validate({ params: sessionIdParamSchema, body: focusRatingSchema }),
  asyncHandler(rateSession),
);

export const focusRouter = Router();

focusRouter.use(requireAuth);

focusRouter.get("/baseline", asyncHandler(getBaselines));
