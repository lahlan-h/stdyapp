import { z } from "zod";

/**
 * Request schemas for the streaks resource.
 *
 * The SHORTEST validation file in this directory, and that is the headline
 * rather than an accident: a streak has no write surface at all. There is no
 * createStreakSchema and no updateStreakSchema because there is no route that
 * would use one - the only writer is recordStudyDay() in streak.service.js,
 * called by endSession.
 *
 * If a PATCH is ever added here, the streak stops being a record of what
 * someone did and becomes a claim about it, and the leaderboard it feeds stops
 * meaning anything. That is a product decision, not a validation one, which is
 * why it is written down here where someone adding a schema will read it.
 */

/**
 * GET /api/streaks/user/:userId.
 *
 * users.id is TEXT in Postgres, so an invalid id would otherwise just miss and
 * return a confusing 404 - the reason sessionIdParamSchema gives.
 */
export const streakUserParamSchema = z.strictObject({
  userId: z.uuid("userId must be a UUID"),
});
