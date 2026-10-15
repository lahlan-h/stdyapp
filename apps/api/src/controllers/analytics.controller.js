import * as analyticsService from "../services/analytics.service.js";

/**
 * Thin by design: status code and response shape only.
 *
 * Read-only, like streak.controller.js - analytics are derived from sessions,
 * goals and streaks, so there is nothing here to write. The query arrives
 * already defaulted and with tz in canonical form (see analytics.validation.js).
 */

export const getMine = async (req, res, next) => {
  try {
    const analytics = await analyticsService.getMyAnalytics(req.user.id, req.validated.query);
    res.status(200).json(analytics);
  } catch (err) {
    next(err);
  }
};
