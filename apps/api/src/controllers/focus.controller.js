import * as focusService from "../services/focus.service.js";

/**
 * HTTP shell for the focus estimate. No try/catch anywhere in this file -
 * asyncHandler in focus.routes.js forwards rejections to the error middleware,
 * and every handler can assume req.validated exists because validate() ran
 * first and short-circuited anything malformed.
 */

/**
 * POST /api/sessions/:id/focus-samples - stores a batch of samples.
 *
 * 201 with a count rather than the created rows: a client posts up to 500 at a
 * time and has no use for them echoed back.
 */
export const createSamples = async (req, res) => {
  const result = await focusService.ingestSamples(
    req.validated.params.id,
    req.user.id,
    req.validated.body.samples,
  );

  res.status(201).json({ data: result });
};

/**
 * GET /api/sessions/:id/focus - the estimate and the context to explain it.
 *
 * focusScore is null while a session is still running or was never sampled.
 * That is not an error - it is the honest answer.
 */
export const getFocus = async (req, res) => {
  const focus = await focusService.getSessionFocus(
    req.validated.params.id,
    req.user.id,
  );

  res.status(200).json({ data: focus });
};

/**
 * GET /api/sessions/:id/focus-samples - one page of raw samples, oldest first.
 * Backs the in-app focus timeline. Same pagination envelope as /api/users.
 */
export const listSamples = async (req, res) => {
  const { items, total, page, limit } = await focusService.listSessionSamples(
    req.validated.params.id,
    req.user.id,
    req.validated.query,
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
};

/**
 * PUT /api/sessions/:id/focus-rating - the user's own 1-5 verdict.
 *
 * PUT, not POST, and 200, not 201: there is exactly one rating per session, so
 * resubmitting replaces rather than creates. Returning 201 the first time and
 * 200 after would make the client's job harder for no benefit.
 */
export const rateSession = async (req, res) => {
  const rating = await focusService.rateSession(
    req.validated.params.id,
    req.user.id,
    req.validated.body.selfRating,
  );

  res.status(200).json({ data: rating });
};

/**
 * GET /api/focus/baseline - the caller's own calibration state.
 *
 * No :id - a user can only ever read their own baseline, so taking one from the
 * URL would just be an authorisation check waiting to be forgotten.
 */
export const getBaselines = async (req, res) => {
  const baselines = await focusService.getBaselines(req.user.id);
  res.status(200).json({ data: baselines });
};
