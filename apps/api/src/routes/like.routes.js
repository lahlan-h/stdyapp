import { Router } from "express";
import {
  create,
  listByPost,
  summary,
  listMine,
  listByUser,
  removeByPost,
  removeMine,
  listAll,
} from "../controllers/like.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";

const router = Router();

// See session.routes.js — authentication is a router-level concern here rather
// than something each route opts into, so a route added later is protected by
// default. Reads are open to any authenticated caller (a like is public social
// data); it is the WRITES that are scoped to the token holder, inside the
// service. See the authorisation note at the top of like.service.js.
router.use(requireAuth);

// Post-scoped paths live in THIS file rather than in post.routes.js: every
// router here is a flat top-level resource that owns its own sub-paths
// (studyRoutine.routes.js owns /:id/todos, studyGroup.routes.js owns
// /:id/members), and two files owning likes is how one of these routes would
// eventually acquire the wrong auth rule by accident.
//
// Declared before the bare "/" routes, following post.routes.js. Note there is
// no "/:id" route at all — unlike is keyed by postId, which a client rendering
// a heart already has, whereas it may never have seen the like's own id. That
// removes the shadowing hazard post.routes.js has to warn about.
router.get("/post/:postId/count", summary);
router.get("/post/:postId", listByPost);
router.delete("/post/:postId", removeByPost);

router.get("/user/:userId", listByUser);
router.delete("/user/me", removeMine);

// Grouped with the other literal paths for consistency with post.routes.js.
// Unlike there, ordering is not load-bearing here — this file declares no
// "/:id" route, so nothing can swallow a single-segment literal.
router.get("/all", validate({ query: paginationQuerySchema }), listAll);

router.post("/", create);
router.get("/", listMine);

// No PATCH, and its absence next to post.routes.js is deliberate rather than an
// oversight. Every column on a like is either the primary key or half the row's
// identity: rewriting userId or postId does not EDIT a like, it makes it a
// different one — a delete plus a create. Post has a PATCH because caption and
// photoUrl are editable content; a like has no such field. If a reaction type
// is ever added, that is when a PATCH earns its place.

export default router;
