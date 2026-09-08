import { randomUUID } from "node:crypto";

import * as subscriptionRepo from "../repositories/subscription.repository.js";
import { HttpError } from "../utils/httpError.js";
import { bumpVersions, subscriptionUserVersionKey } from "../utils/cache.js";

/**
 * ⚠ THERE IS NO PAYMENT PROVIDER BEHIND THIS MODULE.
 *
 * POST /api/subscriptions grants premium to anyone who asks. That is the
 * correct behaviour for a project with no merchant account and no intention of
 * taking real money, and it is written here in the largest letters available so
 * that nobody deploys it believing otherwise.
 *
 * What this module DOES buy, versus not writing it at all: the shape is right.
 * Status is server-computed, the renewal date is server-computed, the payment
 * reference is opaque and generated rather than supplied, and no request body
 * reaches the table. Wiring in a real provider then means replacing the two
 * marked stubs below and adding a webhook route - not unpicking a design where
 * the client was trusted.
 *
 * WHAT MUST CHANGE BEFORE ANY OF THIS TOUCHES REAL MONEY:
 *   1. `subscribe` must not grant ACTIVE. It must create a PENDING checkout
 *      with the provider and return a redirect, with the provider's webhook
 *      being the only thing that ever writes ACTIVE.
 *   2. `paymentReference` must hold the provider's id, not a local uuid.
 *   3. Something must EXPIRE subscriptions whose renewsAt has passed. See the
 *      note on isExpired below - reading it lazily is a deliberate stopgap.
 */

// A month, near enough, and only ever used by the stub. A real provider owns
// the billing period and this constant disappears with the stub.
const STUB_PERIOD_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Prefixed so a stub reference is obvious at a glance in the database and in a
// log line, and can be found and migrated when a real provider replaces it.
const STUB_REFERENCE_PREFIX = "stub_";

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
 * The difference from streaks, and the reason this needs a real fix sooner: a
 * streak is cosmetic, while this decides whether someone gets a paid feature.
 * A cron or a queue consumer that ages subscriptions out is the proper answer.
 */
const isExpired = (subscription) =>
  Boolean(subscription.renewsAt) && subscription.renewsAt.getTime() <= Date.now();

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
 * POST /api/subscriptions - the stub checkout.
 *
 * ⚠ STUB. Grants premium unconditionally. See the module header.
 *
 * Every value written here is computed from the clock and a CSPRNG, and none of
 * it comes from the request - the body is parsed as an empty strictObject, so a
 * client sending `{"renewsAt":"2099-01-01"}` gets a 400 rather than a century
 * of free access.
 *
 * An upsert rather than a create, so resubscribing after a cancellation works
 * without a 409 on the unique constraint.
 */
export const subscribe = async (userId) => {
  const renewsAt = new Date(Date.now() + STUB_PERIOD_DAYS * MILLISECONDS_PER_DAY);

  const subscription = await subscriptionRepo.upsertSubscription({
    userId,
    status: "ACTIVE",
    // randomUUID rather than a counter or a timestamp: a payment reference is
    // quoted in support conversations and must not be guessable or say anything
    // about how many subscribers there are.
    paymentReference: `${STUB_REFERENCE_PREFIX}${randomUUID()}`,
    renewsAt,
  });

  await invalidateSubscription(userId);

  return toResponse(subscription);
};

/**
 * POST /api/subscriptions/cancel.
 *
 * Does NOT delete the row and does NOT clear renewsAt: the user keeps what they
 * paid for until the period ends. Deleting here would be the intuitive
 * implementation and would silently cut someone off mid-period.
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

  const subscription = await subscriptionRepo.setSubscriptionStatus(
    userId,
    "CANCELLED",
  );

  await invalidateSubscription(userId);

  return toResponse(subscription);
};
