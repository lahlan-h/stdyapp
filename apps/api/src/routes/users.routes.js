import { Router } from "express";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
} from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
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
 */
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

router.patch(
  "/:id",
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(updateUser),
);

router.delete(
  "/:id",
  validate({ params: userIdParamSchema }),
  asyncHandler(deleteUser),
);

export default router;
