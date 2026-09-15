import * as subscriptionService from "../services/subscription.service.js";

/**
 * Thin by design: status codes and response shape only, no policy.
 *
 * ⚠ NOTHING HERE READS req.validated.body, and that is the point rather than an
 * oversight. Every column on the subscription is computed server-side - now
 * from what Stripe reports rather than from the clock - so there is nothing on
 * the wire to forward. The body is still validated, as an empty strictObject,
 * so that an attempt to send one is a 400 rather than silence. See
 * subscription.validation.js.
 */

export const getMine = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.getMySubscription(req.user.id);
    res.status(200).json(subscription);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/subscriptions - starts a Stripe Checkout Session.
 *
 * ⚠ 200 AND A URL, where the stub returned 201 AND A SUBSCRIPTION. This is the
 * one breaking change in the Stripe migration, and the status code is the
 * honest part of it: nothing has been created. The user has not paid, no row
 * exists, and they may well abandon the page. The subscription appears only
 * when checkout.session.completed arrives at the webhook, which happens after
 * this response has already been sent.
 *
 * A client therefore cannot read premium state from this response. It opens the
 * URL, and re-reads GET /api/subscriptions/me when the user comes back - by
 * which point the webhook has usually, but not certainly, landed. That gap is
 * inherent to Checkout rather than a shortcoming here.
 */
export const subscribe = async (req, res, next) => {
  try {
    const { url } = await subscriptionService.createCheckoutSession(req.user.id);
    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/subscriptions/cancel.
 *
 * 200 with the updated row rather than 204: the caller needs renewsAt back, as
 * it is the date their access actually ends and the only thing worth showing
 * after a cancellation.
 *
 * The row returned here is written from Stripe's response, not from the
 * webhook - so it is authoritative rather than optimistic, and the
 * customer.subscription.updated that follows a moment later writes the same
 * values again. See cancelSubscription for why that duplication is deliberate.
 */
export const cancel = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.cancelSubscription(req.user.id);
    res.status(200).json(subscription);
  } catch (err) {
    next(err);
  }
};