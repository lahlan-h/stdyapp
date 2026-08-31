import * as groupService from "../services/studyGroup.service.js";

// Same temporary fallback as session.controller.js — remove once auth
// middleware is merged and sets req.user.
const getUserId = (req) => req.user?.id ?? req.body?.userId ?? req.query?.userId;

export const create = async (req, res, next) => {
  try {
    const { name, description, isPrivate } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const group = await groupService.createGroup({
      ownerId: getUserId(req),
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
    const group = await groupService.getGroup(req.params.id, getUserId(req));
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const search = async (req, res, next) => {
  try {
    const groups = await groupService.searchGroups(req.query.q, getUserId(req));
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    const group = await groupService.updateGroup(req.params.id, getUserId(req), req.body);
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await groupService.deleteGroup(req.params.id, getUserId(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const transferOwnership = async (req, res, next) => {
  try {
    const { newOwnerId } = req.body;
    if (!newOwnerId) return res.status(400).json({ error: "newOwnerId is required" });

    const group = await groupService.transferOwnership(
      req.params.id,
      getUserId(req),
      newOwnerId
    );
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const join = async (req, res, next) => {
  try {
    const { joinCode } = req.body;
    const membership = await groupService.joinGroup(req.params.id, getUserId(req), joinCode);
    res.status(201).json(membership);
  } catch (err) {
    next(err);
  }
};

export const leave = async (req, res, next) => {
  try {
    await groupService.leaveGroup(req.params.id, getUserId(req));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const members = async (req, res, next) => {
  try {
    const list = await groupService.listMembers(req.params.id);
    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
};

export const kickMember = async (req, res, next) => {
  try {
    await groupService.kickMember(req.params.id, getUserId(req), req.params.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const setMemberRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: "role is required" });

    const membership = await groupService.setMemberRole(
      req.params.id,
      getUserId(req),
      req.params.userId,
      role
    );
    res.status(200).json(membership);
  } catch (err) {
    next(err);
  }
};