import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  listByUser,
  update,
  remove,
  removeMine,
} from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// See session.routes.js — every post route acts on the caller's own data, so
// authentication is a router-level concern rather than something each route
// opts into, and a route added later is protected by default.
router.use(requireAuth);

// The /user/* routes are two segments deep, so "/:id" below cannot swallow
// them either way — but they are declared FIRST so that adding a
// "/user/:userId" DELETE later cannot silently shadow "/user/me".
//
// listByUser is the one route here that reads someone else's data; the bulk
// delete is strictly self-only and takes its target from the token.
router.get("/user/:userId", listByUser);
router.delete("/user/me", removeMine);

router.post("/", create);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
