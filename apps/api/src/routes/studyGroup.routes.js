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

const router = Router();

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