import { Router } from "express";
import healthRoutes from "./health.routes.js";
import usersRoutes from "./users.routes.js";
import sessionRoutes from "./session.routes.js"
import groupRoutes from "./studyGroup.routes.js"

const router = Router();

router.use("/health", healthRoutes);
router.use("/users", usersRoutes);
router.use("/sessions", sessionRoutes);
router.use("/groups", groupRoutes);

export default router;
