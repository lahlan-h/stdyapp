import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import sessionRoutes from "./session.routes.js"
import groupRoutes from "./studyGroup.routes.js"
import routineRoutes from "./studyRoutine.routes.js"
import postRoutes from "./post.routes.js"
import likeRoutes from "./like.routes.js"
import commentRoutes from "./comment.routes.js"
import followRoutes from "./follow.routes.js"
import blockRoutes from "./block.routes.js"
import bookmarkRoutes from "./bookmark.routes.js"
import reportRoutes from "./report.routes.js"
import devAuthRoutes from "./devAuth.routes.js"
import { isDevAuthEnabled } from "../config/auth.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/sessions", sessionRoutes);
router.use("/groups", groupRoutes);
router.use("/routines", routineRoutes);
router.use("/posts", postRoutes);
router.use("/likes", likeRoutes);
router.use("/comments", commentRoutes);
router.use("/follows", followRoutes);
router.use("/blocks", blockRoutes);
router.use("/bookmarks", bookmarkRoutes);
router.use("/reports", reportRoutes);

// DEVELOPMENT ONLY. POST /api/auth/dev-token mints an access token with no
// credentials, so it must be ABSENT rather than merely guarded anywhere else:
// this fails closed, and anything but the exact string "development" leaves the
// route unmounted and therefore a plain 404.
//
// Mounted AFTER the real /auth router so it adds a path rather than shadowing
// one, and evaluated here at module scope safely because index.js imports
// ./config/env.js before this file, so process.env is already populated.
if (isDevAuthEnabled()) {
  router.use("/auth", devAuthRoutes);
}

export default router;
