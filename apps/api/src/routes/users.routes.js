import { Router } from "express";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
} from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSelf } from "../middleware/requireSelf.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from "../validation/user.validation.js";

const router = Router();

/**
 * CRUD for /api/users.
 *
 * Two wrappers on every route, both load-bearing:
 *
 *  - validate() runs first and short-circuits with a 400, so every controller
 *    can assume req.validated exists and is well formed.
 *  - asyncHandler() is mandatory on Express 4, which ignores the promise an
 *    async handler returns. Without it a thrown error becomes an unhandled
 *    rejection and the request hangs instead of reaching the error middleware
 *    in index.js.
 *
 * Access policy, in full:
 *
 *  - EVERY route needs a valid access token. Router-level rather than per-route
 *    for the reason given in session.routes.js - a route added later is
 *    protected by default, which is the safe direction to fail.
 *  - Reads stay open to any authenticated user: listUsers is a paginated,
 *    searchable directory, so browsing other people is the point.
 *  - Writes are self-only, via requireSelf. Authentication alone would merely
 *    downgrade "anyone can delete any account" to "anyone with an account can
 *    delete any account", which is not the fix it looks like.
 *
 * Signup is unaffected: POST /api/auth/register is still public.
 */
router.use(requireAuth);

router.get(
  "/",
  validate({ query: listUsersQuerySchema }),
  asyncHandler(listUsers),
);

router.post("/", validate({ body: createUserSchema }), asyncHandler(createUser));

router.get(
  "/:id",
  validate({ params: userIdParamSchema }),
  asyncHandler(getUser),
);

// requireSelf sits AFTER validate on both mutating routes, deliberately: a
// malformed id should be the 400 that says so, not a 403 about ownership.
router.patch(
  "/:id",
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  requireSelf,
  asyncHandler(updateUser),
);

router.delete(
  "/:id",
  validate({ params: userIdParamSchema }),
  requireSelf,
  asyncHandler(deleteUser),
);

export default router;
