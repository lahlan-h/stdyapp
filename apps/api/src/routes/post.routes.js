import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  update,
  remove,
} from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// See session.routes.js — every post route acts on the caller's own data, so
// authentication is a router-level concern rather than something each route
// opts into, and a route added later is protected by default.
router.use(requireAuth);

router.post("/", create);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
