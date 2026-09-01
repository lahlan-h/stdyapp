import * as routineService from "../services/studyRoutine.service.js";

export const create = async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const routine = await routineService.createRoutine({ userId: req.user.id, title });
    res.status(201).json(routine);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const routine = await routineService.getRoutine(req.params.id, req.user.id);
    res.status(200).json(routine);
  } catch (err) {
    next(err);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const routines = await routineService.listMyRoutines(req.user.id);
    res.status(200).json(routines);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const routine = await routineService.updateRoutine(req.params.id, req.user.id, req.body);
    res.status(200).json(routine);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await routineService.deleteRoutine(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const clone = async (req, res, next) => {
  try {
    const routine = await routineService.cloneRoutine(req.params.id, req.user.id);
    res.status(201).json(routine);
  } catch (err) {
    next(err);
  }
};

export const addTodoItem = async (req, res, next) => {
  try {
    const { title, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });

    const todo = await routineService.addTodoItem(req.params.id, req.user.id, { title, dueDate });
    res.status(201).json(todo);
  } catch (err) {
    next(err);
  }
};

export const updateTodoItem = async (req, res, next) => {
  try {
    const todo = await routineService.updateTodoItem(
      req.params.id,
      req.params.todoId,
      req.user.id,
      req.body
    );
    res.status(200).json(todo);
  } catch (err) {
    next(err);
  }
};

export const deleteTodoItem = async (req, res, next) => {
  try {
    await routineService.deleteTodoItem(req.params.id, req.params.todoId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
