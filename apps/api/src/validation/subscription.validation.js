import { z } from "zod";

/**
 * Request schemas for the subscriptions resource.
 *
 * ⚠ THIS FILE IS A SECURITY BOUNDARY, not a convenience. Read the note on
 * emptyBodySchema before adding a field to it.
 */

/**
 * The body of POST /api/subscriptions and POST /api/subscriptions/cancel.
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
