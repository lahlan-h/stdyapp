import {
  getStripe,
  getStripePriceId,
  getCheckoutSuccessUrl,
  getCheckoutCancelUrl,
} from "../config/stripe.js";
import {
  findUserIdByStripeCustomer,
  getStripeCustomerId,
  setStripeCustomerId,
} from "./user.service.js";
import * as subscriptionRepo from "../repositories/subscription.repository.js";
import { HttpError } from "../utils/httpError.js";
import { bumpVersions, subscriptionUserVersionKey } from "../utils/cache.js";

/**
 * Subscriptions, backed by Stripe.
 *
 * ⚠ STRIPE IS THE SOURCE OF TRUTH FOR EVERY ROW IN THIS TABLE. Nothing here
 * decides that someone is premium: createCheckoutSession returns a URL and
 * writes nothing, and the only function that writes ACTIVE is syncFromStripe,
 * which runs from a signature-verified webhook and re-fetches the subscription
 * from Stripe rather than trusting the delivered payload.
 *
 * That preserves, and strengthens, the property this module had as a stub: no
 * request body reaches the table. Both write routes still parse an EMPTY
 * strictObject - see subscription.validation.js - so a client sending
 * {"status":"ACTIVE"} gets a 400 rather than a free upgrade.
 *
 * STILL OUTSTANDING:
 *   1. Rows written by the old stub carry a `stub_` reference and exist nowhere
 *      at Stripe. cancelSubscription has a branch for them; delete it, and this
 *      note, once none remain.
 *   2. Nothing EXPIRES a subscription whose renewsAt has passed without a
 *      webhook arriving - see isExpired below. Stripe's renewal events keep
 *      renewsAt current in practice, which makes the lazy read correct far more
 *      often than it was, but a missed delivery still leaves a stale ACTIVE.
 */

const invalidateSubscription = async (userId) => {
  await bumpVersions([subscriptionUserVersionKey(userId)]);
};

/**
 * Has this subscription's paid period run out?
 *
 * Computed ON READ rather than stored, and that is a stopgap rather than a
 * design: with no scheduler in this app there is nothing to run at midnight and
 * flip ACTIVE rows to EXPIRED, so a stored status would go stale the moment a
 * renewal date passed. The same problem streaks have, solved the same way - see
 * toEffectiveStreak in streak.service.js.
 *
 * Less load-bearing than it was under the stub: Stripe pushes renewals and
 * cancellations through syncFromStripe, so renewsAt is usually current. It is
 * still the only thing standing between a missed webhook and permanent free
 * premium, which is why it stays.
 */
const isExpired = (subscription) =>
  Boolean(subscription.renewsAt) && subscription.renewsAt.getTime() <= Date.now();

/**
 * When the current paid period ends, as a Date.
 *
 * ⚠ READS TWO PLACES ON PURPOSE. current_period_end used to sit on the
 * Subscription, and in recent API versions it lives on each subscription ITEM
 * instead - a subscription can bill several items on different cycles, so there
 * is no single period at the top level any more. Which one you get depends on
 * STRIPE_API_VERSION in config/stripe.js, so both are handled rather than
 * quietly returning null the day that pin moves.
 *
 * Stripe sends seconds; JavaScript wants milliseconds. Getting that wrong gives
 * a renewsAt in January 1970, which reads as EXPIRED and silently denies access
 * to someone who just paid.
 */
const toRenewsAt = (stripeSub) => {
  const seconds =
    stripeSub.current_period_end ??
    stripeSub.items?.data?.[0]?.current_period_end;

  return seconds ? new Date(seconds * 1000) : null;
};

/**
 * Stripe's subscription status, mapped onto this app's three.
 *
 * Stripe has eight or so; the mapping is where the product decision lives:
 *
 *  - trialing counts as ACTIVE. A trial is access.
 *  - past_due and unpaid also count as ACTIVE. A failed card is not a decision
 *    to stop paying - Stripe retries for days and then cancels on its own,
 *    which arrives as a status we DO act on. Cutting access at the first
 *    failure would punish an expired card mid-period.
 *  - cancel_at_period_end maps to CANCELLED regardless of the Stripe status,
 *    because that flag is exactly what CANCELLED means here: cancelled, but
 *    still inside the paid period. See the SubscriptionStatus comment in
 *    schema.prisma.
 *  - incomplete means the first payment has not settled. NOT written at all -
 *    writing ACTIVE here would grant premium for an abandoned checkout.
 *
 * @returns {"ACTIVE" | "CANCELLED" | "EXPIRED" | null} null means "do not write"
 */
const toLocalStatus = (stripeSub) => {
  switch (stripeSub.status) {
    case "active":
    case "trialing":
    case "past_due":
    case "unpaid":
      return stripeSub.cancel_at_period_end ? "CANCELLED" : "ACTIVE";

    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "EXPIRED";

    // incomplete, and anything Stripe adds later.
    default:
      return null;
  }
};

/**
 * The client-facing shape.
 *
 * Adds `isPremium`, which is the only question a client actually has, so that
 * every screen does not re-implement "ACTIVE, or CANCELLED but not yet past
 * renewsAt" - a rule that WILL be got wrong somewhere if it is left to the
 * caller, and got wrong in the direction of showing paid features for free.
 */
const toResponse = (subscription) => {
  const expired = isExpired(subscription);

  return {
    id: subscription.id,
    userId: subscription.userId,
    // Reported as EXPIRED without writing the column, per the note above.
    status: expired ? "EXPIRED" : subscription.status,
    paymentReference: subscription.paymentReference,
    renewsAt: subscription.renewsAt,
    // A cancelled subscription keeps its access until the period ends, which is
    // the whole reason CANCELLED and EXPIRED are separate values.
    isPremium: !expired && subscription.status !== "EXPIRED",
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
};

/**
 * The Stripe customer for this user, created on first use.
 *
 * Deliberately sends NO email or name. Checkout collects an email itself, and
 * this codebase's user allowlist is fail-closed by design - reaching past it to
 * copy personal data into a third party is not something a checkout needs.
 * metadata.userId is for a human reading the Stripe dashboard, never trusted
 * as input: the webhook resolves users through users.stripeCustomerId.
 *
 * The retry is not defensive padding. Two concurrent checkouts both see a null
 * customer id, both create one at Stripe, and the second write loses on the
 * @unique - leaving an orphaned customer that nothing references. Re-reading
 * returns the winner's id, which is the correct answer for both requests.
 */
const getOrCreateStripeCustomer = async (userId) => {
  const existing = await getStripeCustomerId(userId);
  if (existing) return existing;

  const customer = await getStripe().customers.create({
    metadata: { userId },
  });

  try {
    await setStripeCustomerId(userId, customer.id);
    return customer.id;
  } catch (err) {
    const winner = await getStripeCustomerId(userId);
    if (winner) return winner;
    throw err;
  }
};

/**
 * GET /api/subscriptions/me.
 *
 * 404 when the user has never subscribed. The absence of a row IS the free
 * tier - see the model comment in schema.prisma - so a client should read a 404
 * here as "not premium" rather than as an error, and that is worth stating in
 * the API docs when they exist.
 *
 * Owner-only by construction rather than by a check: there is no path parameter
 * to get wrong, because the route is /me and the id comes from the token.
 */
export const getMySubscription = async (userId) => {
  const subscription = await subscriptionRepo.findSubscriptionByUser(userId);
  if (!subscription) throw new HttpError(404, "No subscription found");

  return toResponse(subscription);
};

/**
 * POST /api/subscriptions - starts a Stripe Checkout Session.
 *
 * ⚠ WRITES NOTHING TO subscriptions, which is the whole shape of the Stripe
 * migration. The stub granted premium here from the clock; this returns a URL
 * and nothing more. The row appears when checkout.session.completed reaches
 * syncFromStripe, and never before - so there is no path by which starting a
 * checkout grants access.
 *
 * The 409 below is load-bearing rather than politeness. Checkout will happily
 * create a SECOND Stripe subscription for a customer who already has one, and
 * both would bill. This schema allows one row per user, so the second would
 * also silently overwrite the first's reference and orphan it at Stripe.
 *
 * @param {string} userId
 * @returns {Promise<{ url: string }>}
 * @throws {HttpError} 409 when the user is already premium
 */
export const createCheckoutSession = async (userId) => {
  const existing = await subscriptionRepo.findSubscriptionByUser(userId);

  // isExpired rather than status alone: a CANCELLED subscription still inside
  // its paid period is premium, and resubscribing mid-period would double-bill.
  // Once it has actually expired, a fresh checkout is exactly right.
  if (existing && !isExpired(existing) && existing.status !== "EXPIRED") {
    throw new HttpError(409, "Already subscribed");
  }

  const customer = await getOrCreateStripeCustomer(userId);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: getStripePriceId(), quantity: 1 }],
    success_url: getCheckoutSuccessUrl(),
    cancel_url: getCheckoutCancelUrl(),
    // Belt and braces for the dashboard. The webhook does NOT read this - it
    // goes through the customer id, which is the column with the constraint.
    client_reference_id: userId,
  });

  return { url: session.url };
};

/**
 * POST /api/subscriptions/cancel.
 *
 * Sets cancel_at_period_end at Stripe rather than cancelling outright, which is
 * what preserves the property the old stub had for free: the user keeps what
 * they paid for until renewsAt. An immediate `subscriptions.cancel` would end
 * it mid-period and refund nothing.
 *
 * The local row is then written from STRIPE'S RESPONSE, not from the webhook.
 * The customer.subscription.updated that follows a second later writes the same
 * values again through syncFromStripe, which is deliberate duplication: waiting
 * for it would mean returning a row that still said ACTIVE, and a client
 * showing "cancelled" only after a refresh is worse than one redundant write.
 *
 * 409 rather than 200 on an already-cancelled subscription, unlike the
 * idempotent deletes elsewhere in this codebase. The asymmetry is deliberate -
 * cancelling is a decision with a date attached, and quietly succeeding would
 * leave a client unable to tell whether it had just cancelled or was looking at
 * a cancellation from three weeks ago.
 */
export const cancelSubscription = async (userId) => {
  const existing = await subscriptionRepo.findSubscriptionByUser(userId);
  if (!existing) throw new HttpError(404, "No subscription found");

  if (existing.status !== "ACTIVE") {
    throw new HttpError(409, "Subscription is not active");
  }

  // Rows created by the old stub carry a locally generated reference and exist
  // nowhere at Stripe. Cancelling them is a purely local status change - there
  // is nothing to call. Remove this branch once no such rows remain.
  if (!existing.paymentReference?.startsWith("sub_")) {
    const local = await subscriptionRepo.setSubscriptionStatus(userId, "CANCELLED");
    await invalidateSubscription(userId);
    return toResponse(local);
  }

  const stripeSub = await getStripe().subscriptions.update(
    existing.paymentReference,
    { cancel_at_period_end: true },
  );

  const subscription = await subscriptionRepo.upsertSubscription({
    userId,
    status: "CANCELLED",
    paymentReference: stripeSub.id,
    // Re-read rather than kept: Stripe is the source of truth for this date,
    // and the local copy may predate a renewal.
    renewsAt: toRenewsAt(stripeSub),
  });

  await invalidateSubscription(userId);

  return toResponse(subscription);
};

/**
 * Brings the local row into line with what Stripe currently says.
 *
 * ⚠ THE EVENT PAYLOAD IS DELIBERATELY NOT TRUSTED. Only the subscription id is
 * taken from it; the state is re-fetched from Stripe. Webhooks are delivered at
 * least once and NOT in order, so acting on a payload can apply a stale one
 * over a newer one - a renewal arriving before the cancellation that preceded
 * it would leave someone premium forever. Re-fetching means every delivery,
 * however late or duplicated, converges on the same answer. The cost is one API
 * call per event, which at this volume is nothing.
 *
 * Called ONLY by the webhook controller. It takes no userId and performs no
 * ownership check because there is no caller to authorise - the signature check
 * upstream is what stands in for one.
 *
 * @param {string} stripeSubscriptionId
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export const syncFromStripe = async (stripeSubscriptionId) => {
  const stripeSub = await getStripe().subscriptions.retrieve(stripeSubscriptionId);

  // Expanded or not depending on how it was fetched, so handle both rather than
  // assuming a string and silently querying for the id "[object Object]".
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer.id;

  const userId = await findUserIdByStripeCustomer(customerId);
  if (!userId) {
    return { applied: false, reason: `no local user for customer ${customerId}` };
  }

  const status = toLocalStatus(stripeSub);
  if (!status) {
    return { applied: false, reason: `not acting on Stripe status ${stripeSub.status}` };
  }

  const existing = await subscriptionRepo.findSubscriptionByUser(userId);

  /**
   * One user can end up with two Stripe subscriptions - a double checkout, or a
   * resubscribe before the old one finished cancelling - while this schema
   * allows exactly one row per user. Without this guard, the OLD one's
   * `deleted` event would arrive after the new one was active and expire a
   * subscription the user is currently paying for.
   *
   * An ACTIVE or CANCELLED incoming subscription still wins: it supersedes
   * whatever was there. It is specifically a terminal state for a subscription
   * we are no longer tracking that gets dropped.
   */
  if (
    existing?.paymentReference &&
    existing.paymentReference !== stripeSub.id &&
    status === "EXPIRED"
  ) {
    return { applied: false, reason: `superseded subscription ${stripeSub.id}` };
  }

  await subscriptionRepo.upsertSubscription({
    userId,
    status,
    paymentReference: stripeSub.id,
    renewsAt: toRenewsAt(stripeSub),
  });

  await invalidateSubscription(userId);

  return { applied: true };
};