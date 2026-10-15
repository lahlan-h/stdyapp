import { z } from "zod";

/**
 * Request schemas for the subscriptions resource.
 *
 * ⚠ THIS FILE IS A SECURITY BOUNDARY, not a convenience. Read the note on
 * emptyBodySchema before adding a field to it.
 */

/**
 * The body of POST /api/subscriptions/cancel. POST /api/subscriptions uses
 * checkoutBodySchema below, which is this plus one allowlisted field.
 *
 * EMPTY, and strict - which together mean any key at all is a 400.
 *
 * That is the entire access-control model of this resource. Every column on the
 * Subscription model is server-written: status, paymentReference and renewsAt
 * are all computed in subscription.service.js. Without strictObject an unknown
 * key would merely be dropped one layer down, which is fine today only because
 * the service destructures nothing from the body - and stops being fine the
 * moment someone adds a field and forwards `req.validated.body` wholesale, the
 * exact mistake studyRoutine.controller.js documents having made.
 *
 * So a client sending {"status":"ACTIVE"} gets a 400 naming the field rather
 * than silence, and a reviewer reading this router sees the refusal spelled out
 * rather than having to prove a negative about the service.
 *
 * Anything a real payment provider needs later - a plan id, a payment method
 * token - belongs in a body schema of its own AND a matching allowlist in the
 * service. It must never be added here as a passthrough.
 */
export const emptyBodySchema = z.strictObject({});

/**
 * Schemes a native app may ask Checkout to return to: its own, and Expo Go's
 * while developing. Deliberately NOT http(s) - see checkoutBodySchema.
 */
export const APP_RETURN_SCHEMES = ["stdyapp:", "exp:", "exps:"];

const isAppReturnUrl = (value) => {
  try {
    const url = new URL(value);
    return APP_RETURN_SCHEMES.includes(url.protocol) && !url.search && !url.hash;
  } catch {
    return false;
  }
};

/**
 * The body of POST /api/subscriptions - the one write that takes a field.
 *
 * returnUrl is where Checkout sends a NATIVE app back to: the app opens
 * Checkout in an auth-session browser that closes itself the moment it is sent
 * to this URL, so nobody sits looking at a web page their phone cannot load.
 * Web omits it and gets the configured success and cancel URLs, as before.
 *
 * ⚠ ONLY APP SCHEMES, never http(s). An arbitrary web URL here would make this
 * endpoint an open redirect hanging off checkout.stripe.com - a paid-looking
 * hop to anywhere. An app scheme can only reopen an app.
 *
 * No query or fragment: the service appends ?checkout=success|cancelled itself,
 * and refusing one here means it never has to merge with a client's.
 *
 * Still a strictObject, for emptyBodySchema's reason: status, renewsAt and the
 * rest remain server-written, and sending one is still a 400.
 */
export const checkoutBodySchema = z.strictObject({
  returnUrl: z
    .string()
    .max(512)
    .refine(isAppReturnUrl, "must be a stdyapp:// or exp:// URL with no query")
    .optional(),
});
