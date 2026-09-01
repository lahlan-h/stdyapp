import { Router } from "express";
import {
  start,
  getOne,
  listMine,
  end,
  remove,
  addInterruption,
} from "../controllers/session.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Every session route acts on the caller's own data, so authentication is a
// router-level concern rather than something each route opts into. Mounted
// before the table below, it also means a route added later is protected by
// default - the safe direction to fail.
router.use(requireAuth);

router.post("/", start);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id/end", end);
router.delete("/:id", remove);
router.post("/:id/interruptions", addInterruption);

export default router;