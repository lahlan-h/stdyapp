import * as routineService from "../services/studyRoutine.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated throughout — see the note in
 * session.controller.js. The two `if (!title) return 400` guards that used to
 * open create and addTodoItem are gone; the schemas do that work now, and also
 * bound a title that used to be unbounded TEXT.
 *
 * update() and updateTodoItem() no longer forward req.body wholesale. The
 * services destructure what they want, so extra keys were dropped silently one
 * layer down; the strictObject schemas make them a 400 instead.
 *
 * One behaviour change worth knowing: dueDate now arrives as a real Date rather
 * than the string the client sent, because createTodoItemSchema coerces it.
 * Prisma requires a Date for a DateTime column, so a mistyped date used to be a
 * 500 from deep inside the client rather than a 400.
 */

export const create = async (req, res, next) => {
  try {
    const { title } = req.validated.body;

    const routine = await routineService.createRoutine({ userId: req.user.id, title });
    res.status(201).json(routine);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const routine = await routineService.getRoutine(req.validated.params.id, req.user.id);
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
    const routine = await routineService.updateRoutine(
      req.validated.params.id,
      req.user.id,
      req.validated.body,
    );
    res.status(200).json(routine);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await routineService.deleteRoutine(req.validated.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const clone = async (req, res, next) => {
  try {
    const routine = await routineService.cloneRoutine(req.validated.params.id, req.user.id);
    res.status(201).json(routine);
  } catch (err) {
    next(err);
  }
};

export const addTodoItem = async (req, res, next) => {
  try {
    const { title, dueDate } = req.validated.body;

    const todo = await routineService.addTodoItem(req.validated.params.id, req.user.id, {
      title,
      dueDate,
    });
    res.status(201).json(todo);
  } catch (err) {
    next(err);
  }
};

export const updateTodoItem = async (req, res, next) => {
  try {
    const todo = await routineService.updateTodoItem(
      req.validated.params.id,
      req.validated.params.todoId,
      req.user.id,
      req.validated.body
    );
    res.status(200).json(todo);
  } catch (err) {
    next(err);
  }
};

export const deleteTodoItem = async (req, res, next) => {
  try {
    await routineService.deleteTodoItem(
      req.validated.params.id,
      req.validated.params.todoId,
      req.user.id,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
