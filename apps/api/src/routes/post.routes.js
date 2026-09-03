import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  listByUser,
  update,
  remove,
  removeMine,
  listAll,
} from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";

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

// MUST stay above GET "/:id". That pattern is a single segment, so it matches
// "all" too — a /all declared after it would never run, and the request would
// instead reach getOne, look up a post whose id is literally "all", and answer
// 404 "Post not found". A silently wrong answer rather than a routing error.
//
// This is also the only route in this file that validates its query string and
// returns a { data, pagination } envelope; see the note on listAll.
router.get("/all", validate({ query: paginationQuerySchema }), listAll);

router.post("/", create);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);

export default router;
