import * as subscriptionService from "../services/subscription.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * ⚠ NOTHING HERE READS req.validated.body, and that is the point rather than an
 * oversight. Every column on the subscription is computed server-side, so there
 * is nothing on the wire to forward. The body is still validated - as an empty
 * strictObject - so that an attempt to send one is a 400 rather than silence.
 * See subscription.validation.js.
 */

export const getMine = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getMySubscription(req.user.id);
    res.status(200).json(subscription);
  } catch (err) {
    next(err);
  }
};

// 201 rather than 200: this creates a subscription where there was none, and
// unlike the goal upsert the distinction is real - resubscribing after a
// cancellation genuinely starts a new paid period.
export const subscribe = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.subscribe(req.user.id);
    res.status(201).json(subscription);
  } catch (err) {
    next(err);
  }
};

// 200 with the updated row rather than 204: the caller needs renewsAt back, as
// it is the date their access actually ends and the only thing worth showing
// after a cancellation.
export const cancel = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.cancelSubscription(req.user.id);
    res.status(200).json(subscription);
  } catch (err) {
    next(err);
  }
};
