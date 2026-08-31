import { Router } from "express";
import {
  start,
  getOne,
  listMine,
  end,
  remove,
  addInterruption,
} from "../controllers/session.controller.js";

const router = Router();

router.post("/", start);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id/end", end);
router.delete("/:id", remove);
router.post("/:id/interruptions", addInterruption);

export default router;