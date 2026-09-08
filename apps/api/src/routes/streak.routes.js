import { Router } from "express";
import { getMine, getForUser } from "../controllers/streak.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { streakUserParamSchema } from "../validation/streak.validation.js";
import { streakUserVersionKey, streakKey } from "../utils/cache.js";
import { CACHE_TTL_STREAK_SEC, RATE_LIMIT_READ } from "../config/cache.js";

const router = Router();

router.use(requireAuth);

/**
 * ONE BUCKET, and no write tier, because this router has no write routes.
 *
 * That is the headline of the file rather than an accident. A streak is derived
 * from finished sessions and is written only by recordStudyDay, which
 * endSession calls - see the model comment in schema.prisma. Adding a PATCH
 * here would turn the leaderboard from a record of what people did into a
 * record of what they claimed.
 */
const readLimit = rateLimit({ name: "streak-read", ...RATE_LIMIT_READ });

/**
 * Both reads share ONE key builder, keyed on the streak's OWNER rather than the
 * viewer - see the note above streakKey. GET /me and GET /user/:userId return
 * byte-identical payloads for the same subject, so caching them separately
 * would store the same body twice.
 *
 * The two configs below differ only in where they find that subject: the token
 * for /me, the validated path for /user/:userId.
 */
const cacheMine = cache({
  ttlSec: CACHE_TTL_STREAK_SEC,
  versionKeys: (req) => [streakUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => streakKey(req.user.id, version),
});

const cacheForUser = cache({
  ttlSec: CACHE_TTL_STREAK_SEC,
  versionKeys: (req) => [streakUserVersionKey(req.validated.params.userId)],
  buildKey: (req, [version]) => streakKey(req.validated.params.userId, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache, as everywhere else.
 *
 * "/me" is a literal and "/user/:userId" is two segments, so neither can shadow
 * the other and there is no /:id route here for "me" to be mistaken for.
 */

router.get("/me", readLimit, cacheMine, getMine);

router.get(
  "/user/:userId",
  readLimit,
  validate({ params: streakUserParamSchema }),
  cacheForUser,
  getForUser,
);

export default router;
