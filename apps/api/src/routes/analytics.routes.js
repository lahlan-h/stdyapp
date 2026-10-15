import { Router } from "express";
import { getMine } from "../controllers/analytics.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { analyticsQuerySchema } from "../validation/analytics.validation.js";
import {
  analyticsKey,
  goalOwnerVersionKey,
  sessionOwnerVersionKey,
  streakUserVersionKey,
} from "../utils/cache.js";
import { localParts } from "../utils/timeZone.js";
import { CACHE_TTL_ANALYTICS_SEC, RATE_LIMIT_READ } from "../config/cache.js";

const router = Router();

// Caller-owned, like sessions and goals: the subject comes from the token.
router.use(requireAuth);

// One bucket, no write tier - this router has no write routes. See
// streak.routes.js for why a derived resource should stay that way.
const readLimit = rateLimit({ name: "analytics-read", ...RATE_LIMIT_READ });

/**
 * GET /me - stamped with THREE counters, one per domain the payload reads.
 *
 * Sessions (minutes, interruptions, focus points), goals (the targets hit rates
 * are measured against) and the streak. Missing any one would serve a stale
 * number after that domain's write - the goalProgressKey warning, with one more
 * domain.
 *
 * Interruptions need no counter of their own: they can only be logged on an
 * OPEN session, and analytics reads finished ones only. The session becomes
 * visible here when endSession bumps the owner counter.
 *
 * TODAY'S DATE, in the caller's zone, is part of the key. No counter moves at
 * midnight, so without it a payload cached at 11:59pm would be served as
 * tomorrow's answer until the TTL ran out. With it, midnight simply misses.
 *
 * ⚠ buildKey reads req.validated, which is safe only because validate() runs
 * first - and matters more than usual here, because tz is CANONICALISED during
 * validation. A key built from the raw query would split "australia/sydney" and
 * "Australia/Sydney" into two entries for one answer.
 *
 * The order of versionKeys is the order buildKey destructures them.
 */
const cacheMine = cache({
  ttlSec: CACHE_TTL_ANALYTICS_SEC,
  versionKeys: (req) => [
    sessionOwnerVersionKey(req.user.id),
    goalOwnerVersionKey(req.user.id),
    streakUserVersionKey(req.user.id),
  ],
  buildKey: (req, [sessionVersion, goalVersion, streakVersion]) => {
    const { range, tz } = req.validated.query;
    return analyticsKey(req.user.id, {
      range,
      tz,
      today: localParts(new Date(), tz).dateKey,
      sessionVersion,
      goalVersion,
      streakVersion,
    });
  },
});

/**
 * Middleware order is requireAuth (above) -> rateLimit -> validate -> cache, as
 * everywhere else. See session.routes.js for why the limiter goes first.
 *
 * "/me" rather than "/", matching streaks, so a future group analytics route
 * (the pitch's "group stats") can sit beside it as /group/:groupId without
 * renaming this one.
 */
router.get("/me", readLimit, validate({ query: analyticsQuerySchema }), cacheMine, getMine);

export default router;
