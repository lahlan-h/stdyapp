import * as sessionService from "../services/session.service.js";

export const start = async (req, res, next) => {
  try {
    const { groupId } = req.body;
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
    const session = await sessionService.getSession(req.params.id, req.user.id);
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
    const session = await sessionService.endSession(req.params.id, req.user.id);
    res.status(200).json(session);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await sessionService.deleteSession(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const addInterruption = async (req, res, next) => {
  try {
    const { durationSec } = req.body;
    if (typeof durationSec !== "number" || durationSec < 0) {
      return res.status(400).json({ error: "durationSec must be a non-negative number" });
    }
    const interruption = await sessionService.logInterruption(
      req.params.id,
      req.user.id,
      { durationSec }
    );
    res.status(201).json(interruption);
  } catch (err) {
    next(err);
  }
};