import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import usersRoutes from "./users.routes.js";
import sessionRoutes from "./session.routes.js"
import groupRoutes from "./studyGroup.routes.js"
import routineRoutes from "./studyRoutine.routes.js"
import postRoutes from "./post.routes.js"

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/sessions", sessionRoutes);
router.use("/groups", groupRoutes);
router.use("/routines", routineRoutes);
router.use("/posts", postRoutes);

export default router;
