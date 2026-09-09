import * as reportService from "../services/report.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * Input is read from req.validated, never from req.body/req.params — the rule
 * bookmark.controller.js, session.controller.js and users.controller.js all
 * follow, and what makes it visible at each call site that a schema has actually
 * run. There is no hand-rolled `isId` helper here, unlike like.controller.js and
 * block.controller.js: every route on this router carries a Zod schema instead.
 *
 * NOTE: there is deliberately no resolveTargetUserId in this file, where
 * like.controller.js and follow.controller.js both export one. That helper maps
 * the literal "me" onto the caller for a "/user/:userId" route that READS that
 * user's rows. This router's "/user/:userId" is a TARGET rather than an owner —
 * it asks "have I reported this person" — so "me" would resolve to a self-report
 * the service refuses anyway. There is and must be no route here that reads
 * another user's reports; see the authorisation note in report.service.js.
 */

export const create = async (req, res, next) => {
  try {
    // The three fields are destructured explicitly, and createReportSchema is a
    // strictObject besides, so a reporterId or a status smuggled into the body is
    // rejected outright rather than silently ignored — the reporter is always the
    // token holder, and a report always starts PENDING.
    const { targetUserId, targetPostId, reason } = req.validated.body;

    const { report, created } = await reportService.fileReport({
      reporterId: req.user.id,
      targetUserId,
      targetPostId,
      reason,
    });

    // 201 the first time, 200 for a repeat or a reopen. Filing is idempotent (see
    // fileReport), so a double-tap is a success rather than a 409 — but a client
    // that cares which happened can still tell from the status.
    res.status(created ? 201 : 200).json(report);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/:id — one of the caller's own reports.
 *
 * The ownership gate lives in the service, not here: a 403 for somebody else's
 * report is policy, and this layer holds none. See getOwnedReportOrThrow.
 */
export const getOne = async (req, res, next) => {
  try {
    const report = await reportService.getMyReport(
      req.validated.params.id,
      req.user.id,
    );
    res.status(200).json(report);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports — the caller's own filed reports, newest first.
 *
 * req.user.id, never req.params: this router has no route that reads another
 * user's reports, and this handler is where that would first go wrong.
 */
export const listMine = async (req, res, next) => {
  try {
    const reports = await reportService.listMyReports(req.user.id);
    res.status(200).json(reports);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/all — one page of the CALLER'S OWN reports.
 *
 * ⚠ The path is the same as its siblings in the public routers; the meaning is
 * not. There /all is every row in the system. Here it is the caller's own rows,
 * because a global report list with no admin role would publish the entire
 * harassment graph to any authenticated caller. req.user.id is passed to the
 * service alongside the validated page and limit, and it is what makes the two
 * differ — if it ever stops being passed, this route silently becomes the thing
 * it is named after. The same warning listAll carries in block.controller.js and
 * bookmark.controller.js.
 *
 * Returns the { data, pagination } envelope every paginated route in this API
 * returns, rather than the bare array its siblings in this file return.
 */
export const listAll = async (req, res, next) => {
  try {
    const { items, total, page, limit } = await reportService.listMyReportsPage({
      ...req.validated.query,
      reporterId: req.user.id,
    });

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

/**
 * PATCH /api/reports/:id — the only update in the social half of this API.
 *
 * The whole validated body is forwarded rather than destructured field by field,
 * which is safe precisely because updateReportSchema is a strictObject listing
 * exactly two optional fields: anything else is a 400 before this runs. The
 * service does the partial-update assembly, so an absent field stays absent
 * rather than arriving as an explicit undefined Prisma would have to interpret.
 */
export const update = async (req, res, next) => {
  try {
    const report = await reportService.updateMyReport(
      req.validated.params.id,
      req.user.id,
      req.validated.body,
    );
    res.status(200).json(report);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    // 204 with no body, matching every other single-row delete in this API. The
    // count deleteMany returns is discarded: the ownership gate in the service has
    // already turned "not yours" into a 403 and "no such report" into a 404, so by
    // the time this resolves the only remaining outcome is success.
    await reportService.deleteMyReport(req.validated.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeMine = async (req, res, next) => {
  try {
    // req.user.id, never req.params — see deleteMyReports.
    const { count } = await reportService.deleteMyReports(req.user.id);

    // 200 with a body rather than the 204 its single-row sibling returns: the
    // count is the one thing a caller cannot work out for itself afterwards.
    res.status(200).json({ deleted: count });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/user/:userId/status — have I reported this person?
 *
 * req.params.userId is the target and req.user.id is the viewer, in that order,
 * matching getUserReportStatus's signature and the convention getBookmarkStatus
 * and getBlockStatus set. The response carries reportedByMe, the status and the
 * report's id, and nothing else — see the service for why a report COUNT must
 * never join them.
 */
export const statusForUser = async (req, res, next) => {
  try {
    const result = await reportService.getUserReportStatus(
      req.validated.params.userId,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

/** The same for a post target. See statusForUser. */
export const statusForPost = async (req, res, next) => {
  try {
    const result = await reportService.getPostReportStatus(
      req.validated.params.postId,
      req.user.id,
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
