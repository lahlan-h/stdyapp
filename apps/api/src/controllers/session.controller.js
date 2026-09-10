import * as sessionService from "../services/session.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated, never from req.body/req.query/req.params —
 * the same rule users.controller.js and post.controller.js follow. That is what
 * makes it visible at each call site that a schema has actually run, and it is
 * why the hand-rolled durationSec check that used to live in addInterruption is
 * gone: it is now addInterruptionSchema, which also catches the fractional and
 * non-finite values a typeof test lets through.
 */

export const start = async (req, res, next) => {
  try {
    const { groupId } = req.validated.body;
    const session = await sessionService.startSession({
      userId: req.user.id,
      groupId: groupId ?? null,
    });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const session = await sessionService.getSession(req.validated.params.id, req.user.id);
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
};

export const listMine = async (req, res, next) => {
  try {
    const sessions = await sessionService.listMySessions(req.user.id);
    res.status(200).json(sessions);
  } catch (err) {
    next(err);
  }
};

export const end = async (req, res, next) => {
  try {
    const session = await sessionService.endSession(req.validated.params.id, req.user.id);
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await sessionService.deleteSession(req.validated.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const addInterruption = async (req, res, next) => {
  try {
    const { durationSec } = req.validated.body;

    const interruption = await sessionService.logInterruption(
      req.validated.params.id,
      req.user.id,
      { durationSec }
    );
    res.status(201).json(interruption);
  } catch (err) {
    next(err);
  }
};