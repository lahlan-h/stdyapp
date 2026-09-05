import { Router } from "express";
import {
  create,
  getOne,
  listByPost,
  summary,
  listMine,
  listByUser,
  update,
  remove,
  removeMine,
  listAll,
} from "../controllers/comment.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";

const router = Router();

// See post.routes.js — authentication is a router-level concern rather than
// something each route opts into, so a route added here later is protected by
// default. That matters more in this file than most: reads here are open to any
// authenticated caller, so requireAuth is the only gate a read route has.
router.use(requireAuth);

// The post-scoped routes live HERE, in the sub-resource's own router, rather
// than in post.routes.js — the rule like.routes.js sets out. Two files owning
// comments is how one of these routes eventually acquires the wrong auth rule by
// accident.
//
// "/count" is declared above its parent so a "/post/:postId/:something" added
// later cannot shadow it.
router.get("/post/:postId/count", summary);
router.get("/post/:postId", listByPost);

// Two segments deep, so "/:id" below cannot swallow them either way — but
// declared first so that adding a "/user/:userId" DELETE later cannot silently
// shadow "/user/me".
//
// listByUser is the one route here that reads a named person's data; the bulk
// delete is strictly self-only and takes its target from the token.
router.get("/user/:userId", listByUser);
router.delete("/user/me", removeMine);

// MUST stay above GET "/:id". That pattern is a single segment, so it matches
// "all" too — a /all declared after it would never run, and the request would
// instead reach getOne, look up a comment whose id is literally "all", and
// answer 404 "Comment not found". A silently wrong answer rather than a routing
// error.
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
