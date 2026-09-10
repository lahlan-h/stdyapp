import { Router } from "express";
import { getMine, subscribe, cancel } from "../controllers/subscription.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { emptyBodySchema } from "../validation/subscription.validation.js";
import { subscriptionUserVersionKey, subscriptionKey } from "../utils/cache.js";
import {
  CACHE_TTL_SUBSCRIPTION_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_SUBSCRIPTION_WRITE,
} from "../config/cache.js";

const router = Router();

router.use(requireAuth);

/**
 * ⚠ NO ROUTE IN THIS ROUTER TAKES A USER ID. Every one of them is /me-shaped,
 * reading req.user.id from the token, and that is the entire access-control
 * model of the resource - there is no path parameter that could name someone
 * else's subscription and therefore no ownership check to forget.
 *
 * Any future route that DOES take an id - an admin view, a support tool - needs
 * its own gate, and the cache key it uses needs a viewer segment. See the note
 * above subscriptionKey.
 */
const readLimit = rateLimit({ name: "subscription-read", ...RATE_LIMIT_READ });

// The tightest tier in config/cache.js, and bounding meaning rather than cost -
// nobody subscribes five times an hour. Shared by both writes because they are
// two halves of the same rare decision.
const writeLimit = rateLimit({
  name: "subscription-write",
  ...RATE_LIMIT_SUBSCRIPTION_WRITE,
});

const cacheMine = cache({
  ttlSec: CACHE_TTL_SUBSCRIPTION_SEC,
  versionKeys: (req) => [subscriptionUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => subscriptionKey(req.user.id, version),
});

/**
 * Both writes validate an EMPTY body, which is the security boundary rather
 * than a formality: every column on a subscription is server-computed, so a
 * request carrying "status" or "renewsAt" must be a 400 rather than silently
 * ignored one layer down. See subscription.validation.js.
 */

router.get("/me", readLimit, cacheMine, getMine);

router.post("/", writeLimit, validate({ body: emptyBodySchema }), subscribe);

router.post(
  "/cancel",
  writeLimit,
  validate({ body: emptyBodySchema }),
  cancel,
);

export default router;
