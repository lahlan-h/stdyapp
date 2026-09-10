import { prisma } from "@stdyapp/core";

/**
 * Scoped by userId throughout - the @unique on subscriptions.userId makes it
 * the complete address of the row, as it does for streaks.
 *
 * ⚠ Every value written through this file is computed in
 * subscription.service.js from server-side facts. Nothing here takes a `data`
 * object it would forward blindly to Prisma, and that is deliberate: a generic
 * `updateSubscription(userId, data)` would be one careless controller away from
 * letting a request body set its own status. See the note on emptyBodySchema in
 * subscription.validation.js.
 */

export const findSubscriptionByUser = (userId) => {
  return prisma.subscription.findUnique({ where: { userId } });
};

/**
 * Starts or restarts a subscription.
 *
 * upsert because subscribing must work both for someone who has never
 * subscribed and for someone resubscribing after a cancellation - the same
 * request either way, which is what makes it an upsert rather than a create
 * that 409s half the time.
 *
 * @param {{ userId: string, status: string, paymentReference: string, renewsAt: Date }} input
 */
export const upsertSubscription = ({ userId, status, paymentReference, renewsAt }) => {
  return prisma.subscription.upsert({
    where: { userId },
    create: { userId, status, paymentReference, renewsAt },
    update: { status, paymentReference, renewsAt },
  });
};

/**
 * Moves an existing subscription to a new status.
 *
 * Takes the status as a bare argument rather than a data object, per the
 * warning above: this is the ONLY column any caller is allowed to move on its
 * own, and the signature is what says so.
 *
 * Deliberately does NOT touch renewsAt. A cancelled subscription keeps its paid
 * period - clearing the date here would cut someone off the moment they
 * cancelled, which is the difference the SubscriptionStatus comment in
 * schema.prisma draws between CANCELLED and EXPIRED.
 *
 * @param {string} userId
 * @param {string} status - a SubscriptionStatus value
 */
export const setSubscriptionStatus = (userId, status) => {
  return prisma.subscription.update({ where: { userId }, data: { status } });
};
