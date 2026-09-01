import { Router } from "express";
import {
  create,
  getOne,
  search,
  update,
  remove,
  transferOwnership,
  join,
  leave,
  members,
  kickMember,
  setMemberRole,
} from "../controllers/studyGroup.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// See session.routes.js. Note GET / (search) is protected too: the controller
// passes the caller's id to searchGroups so results reflect their membership.
// optionalAuth would be the right call if anonymous discovery is ever wanted.
router.use(requireAuth);

router.post("/", create);
router.get("/", search); // ?q=searchTerm — omit q to list everything
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);
router.patch("/:id/owner", transferOwnership);

router.post("/:id/join", join);
router.delete("/:id/leave", leave);
router.get("/:id/members", members);
router.delete("/:id/members/:userId", kickMember);
router.patch("/:id/members/:userId/role", setMemberRole);

export default router;