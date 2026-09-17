import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "../controllers/stripeWebhook.controller.js";

const router = Router();

/**
 * ⚠ MOUNTED SEPARATELY FROM routes/index.js, and it has to be.
 *
 * Every other router in this codebase hangs off app.use("/api", routes), which
 * in index.js sits BELOW app.use(express.json()) - so by the time a request
 * reaches it the body is already parsed. Signature verification needs the exact
 * bytes Stripe signed, so this one is mounted above the JSON parser instead and
 * brings its own raw parser.
 *
 * express.raw's `type` matters: Stripe posts application/json, and without the
 * match the body would arrive as an empty object rather than a Buffer.
 *
 * NO rateLimit, unlike every other router here. A 429 makes Stripe retry, which
 * is survivable, but a sustained limit during a burst means payment state that
 * arrives late or not at all - and the caller is Stripe, not a user, so there is
 * no abuse case to bound. The signature check already rejects anything else.
 */
router.post(
  "/",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

export default router;