import * as groupService from "../services/studyGroup.service.js";
import { MAX_PAGE_SIZE } from "../validation/pagination.validation.js";

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

/**
 * GET /api/groups - one page of groups, newest first, in the user directory's
 * { data, pagination } envelope (see listUsers in users.controller.js).
 */
export const search = async (req, res, next) => {
  try {
    const { q, page, limit } = req.validated.query;

    /**
     * LEGACY SHAPE for app builds older than pagination: they send no ?page
     * and read the body as a bare array. Answered as one page of the largest
     * size, so they keep working and the query stays bounded - the old route
     * returned every group, which is the gap pagination closed. Remove once
     * no such build is in use.
     */
    if (page === undefined) {
      const legacy = await groupService.searchGroups(
        { q, page: 1, limit: MAX_PAGE_SIZE },
        req.user.id,
      );
      return res.status(200).json(legacy.items);
    }

    const { items, total } = await groupService.searchGroups(
      { q, page, limit },
      req.user.id,
    );
    res.status(200).json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const regenerateJoinCode = async (req, res, next) => {
  try {
    const group = await groupService.regenerateJoinCode(
      req.validated.params.id,
      req.user.id,
    );
    res.status(200).json(group);
  } catch (err) {
    next(err);
  }
};

export const mine = async (req, res, next) => {
  try {
    const groups = await groupService.listMyGroups(req.user.id);
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/groups/join - joins the group a code names, and answers with it
 * as the joiner now sees it, code and all.
 */
export const joinByCode = async (req, res, next) => {
  try {
    const group = await groupService.joinGroupByCode(req.user.id, req.validated.body.code);
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
};

/** GET /api/groups/:id/studying - members in any session right now. */
export const studying = async (req, res, next) => {
  try {
    const people = await groupService.listStudyingMembers(
      req.validated.params.id,
      req.user.id,
    );
    res.status(200).json(people);
  } catch (err) {
    next(err);
  }
};

export const liveSessions = async (req, res, next) => {
  try {
    const sessions = await groupService.listLiveSessions(
      req.validated.params.id,
      req.user.id,
    );
    res.status(200).json(sessions);
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