import { createLogger } from "@stdyapp/core";
import { getStripe, getStripeWebhookSecret } from "../config/stripe.js";
import * as subscriptionService from "../services/subscription.service.js";
import { HttpError } from "../utils/httpError.js";

const log = createLogger("stripe-webhook");

/**
 * The Stripe webhook receiver.
 *
 * ⚠ THIS HANDLER BREAKS EVERY CONVENTION THE OTHER ROUTERS FOLLOW, deliberately.
 * There is no requireAuth (Stripe holds no token - the signature IS the
 * authentication, and a stronger one), no validate (Zod runs on parsed JSON,
 * and verification needs the raw bytes), and no rateLimit (a 429 here drops
 * payment state; see the note in the router).
 *
 * WHAT THE STATUS CODE MEANS HERE is not what it means anywhere else in this
 * API. Stripe reads any non-2xx as "retry me", with backoff, for up to three
 * days. So:
 *   - 400 for a bad signature: a retry cannot fix it, and the code is only for
 *     the human reading `stripe listen` output.
 *   - 500 for a DB or Redis failure: a retry genuinely might fix it, which is
 *     exactly what we want.
 *   - 200 for an event we cannot act on - an unknown type, or a customer with
 *     no local user. Retrying those forever achieves nothing except an endpoint
 *     Stripe eventually marks as failing, so they are logged and accepted.
 */
export const handleStripeWebhook = async (req, res, next) => {
  const signature = req.headers["stripe-signature"];

  // The single most common way this breaks, and it is silent otherwise: if this
  // route ends up mounted BELOW express.json() in index.js, req.body arrives as
  // a parsed object, gets re-serialised with different whitespace, and every
  // signature check fails with a message that says nothing about mounting order.
  if (!Buffer.isBuffer(req.body)) {
    return next(
      new HttpError(
        500,
        "Stripe webhook body is not raw. This route must be mounted with " +
          "express.raw() ABOVE app.use(express.json()) in index.js.",
      ),
    );
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    // Deliberately NOT passed to next(): the error middleware logs a stack, and
    // a failed signature is an expected condition on a public endpoint rather
    // than a bug of ours. The message is Stripe's and names the reason.
    log.warn(`Rejected webhook: ${err.message}`);
    return res.status(400).json({ error: "Invalid signature" });
  }

  log.info(`Received ${event.type} (${event.id})`);

  try {
    let subscriptionId = null;

    switch (event.type) {
      // The session carries the subscription it created. Null when the session
      // was not in subscription mode, which nothing here creates - but a
      // dashboard payment link would, and that must not throw.
      case "checkout.session.completed":
        subscriptionId = event.data.object.subscription;
        break;

      // Both carry the subscription itself, so the id is the object's own.
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        subscriptionId = event.data.object.id;
        break;

      default:
        // Stripe sends far more than we subscribe to, and the dashboard lets
        // anyone add an event type to the endpoint. An unknown one is normal.
        log.info(`Ignoring ${event.type}`);
    }

    if (subscriptionId) {
      const result = await subscriptionService.syncFromStripe(subscriptionId);

      // Logged at info either way: "not applied" is a normal outcome here, not
      // a failure, and the reason is the only thing that explains why a paid
      // user did not turn premium. A thrown error still reaches next() below
      // and becomes a 500, which is what makes Stripe retry.
      log.info(
        result.applied
          ? `Applied ${event.type} for subscription ${subscriptionId}`
          : `Skipped ${event.type}: ${result.reason}`,
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
};