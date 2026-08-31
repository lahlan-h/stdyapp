import { Router } from "express";
import {
  create,
  getOne,
  listMine,
  update,
  remove,
  clone,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem,
} from "../controllers/studyRoutine.controller.js";

const router = Router();

router.post("/", create);
router.get("/", listMine);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", remove);
router.post("/:id/clone", clone);

router.post("/:id/todos", addTodoItem);
router.patch("/:id/todos/:todoId", updateTodoItem);
router.delete("/:id/todos/:todoId", deleteTodoItem);

export default router;
