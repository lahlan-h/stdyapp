import { Router } from "express";

import { devToken } from "../controllers/devAuth.controller.js";

const router = Router();

/**
 * DEVELOPMENT ONLY - mounted by routes/index.js only when
 * NODE_ENV === "development". See devAuth.service.js for the full rationale.
 *
 * Deliberately NOT behind requireAuth: obtaining a token without already having
 * one is the entire purpose.
 *
 * POST rather than GET for two reasons - the first call has a side effect (it
 * creates the dev account), and a token handed back from a GET ends up in shell
 * history, proxy logs and the browser address bar.
 */
router.post("/dev-token", devToken);

export default router;
