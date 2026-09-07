import * as groupService from "../services/studyGroup.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated throughout — see the note in
 * session.controller.js. The three hand-rolled `if (!x) return 400` guards that
 * used to open create, transferOwnership and setMemberRole are gone; the
 * schemas in validation/studyGroup.validation.js do that work now, and do it
 * better (a present-but-empty name used to pass `if (!name)` only when it was
 * "" — "   " went through and was stored).
 *
 * update() no longer forwards req.body wholesale. That mattered: updateGroup
 * passes its data object straight to groupRepo.updateGroup, so an unknown key
 * used to reach Prisma. updateGroupSchema is a strictObject, so it is a 400 now.
 */

export const create = async (req, res, next) => {
  try {
    const { name, description, isPrivate } = req.validated.body;

    const group = await groupService.createGroup({
      ownerId: req.user.id,
      name,
      description,
      isPrivate,
    });
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const group = await groupService.getGroup(req.validated.params.id, req.user.id);
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const search = async (req, res, next) => {
  try {
    const groups = await groupService.searchGroups(req.validated.query.q, req.user.id);
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const group = await groupService.updateGroup(
      req.validated.params.id,
      req.user.id,
      req.validated.body,
    );
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await groupService.deleteGroup(req.validated.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const transferOwnership = async (req, res, next) => {
  try {
    const { newOwnerId } = req.validated.body;

    const group = await groupService.transferOwnership(
      req.validated.params.id,
      req.user.id,
      newOwnerId
    );
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const join = async (req, res, next) => {
  try {
    const { joinCode } = req.validated.body;

    const membership = await groupService.joinGroup(
      req.validated.params.id,
      req.user.id,
      joinCode,
    );
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
};

export const leave = async (req, res, next) => {
  try {
    await groupService.leaveGroup(req.validated.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const members = async (req, res, next) => {
  try {
    const list = await groupService.listMembers(req.validated.params.id);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
};

export const kickMember = async (req, res, next) => {
  try {
    await groupService.kickMember(
      req.validated.params.id,
      req.user.id,
      req.validated.params.userId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const setMemberRole = async (req, res, next) => {
  try {
    const { role } = req.validated.body;

    const membership = await groupService.setMemberRole(
      req.validated.params.id,
      req.user.id,
      req.validated.params.userId,
      role
    );
    res.status(200).json(membership);
  } catch (err) {
    next(err);
  }
};