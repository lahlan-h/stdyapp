import * as goalService from "../services/goal.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated throughout - see the note in
 * session.controller.js. Note that `period` arrives already uppercased, because
 * goalPeriodParamSchema transforms it; nothing here needs to know that the URL
 * spells it in lowercase.
 */

// 200 rather than 201, even when this creates the row. PUT is an upsert here,
// so the caller cannot know which happened and should not have to branch on it.
// 201 would also imply a Location header that has no meaning for a resource
// addressed by a period rather than a generated id.
export const set = async (req, res, next) => {
  try {
    const goal = await goalService.setGoal(
      req.user.id,
      req.validated.params.period,
      req.validated.body.targetMinutes,
    );
    res.status(200).json(goal);
  } catch (err) {
    next(err);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const goals = await goalService.listMyGoals(req.user.id);
    res.status(200).json(goals);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const goal = await goalService.getGoal(req.user.id, req.validated.params.period);
    res.status(200).json(goal);
  } catch (err) {
    next(err);
  }
};

export const getProgress = async (req, res, next) => {
  try {
    const progress = await goalService.getGoalProgress(
      req.user.id,
      req.validated.params.period,
    );
    res.status(200).json(progress);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await goalService.clearGoal(req.user.id, req.validated.params.period);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
