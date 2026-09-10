import { z } from "zod";

/**
 * Request schemas for the goals resource.
 *
 * Conventions follow studyRoutine.validation.js: strictObject everywhere, so an
 * unrecognised key is a loud 400 rather than a silent no-op.
 *
 * The one shape that differs from every other router here is the PARAM. Goals
 * are addressed by PERIOD rather than by id - see the note on periodParamSchema
 * below, and the longer one in goal.routes.js.
 */

/**
 * The absolute ceiling, in minutes: seven days.
 *
 * Deliberately NOT the real limit for a daily goal, which is one day. A body
 * schema cannot see the period - validate() parses params and body against
 * separate schemas - so the per-period ceiling is enforced one layer down in
 * goal.service.js, which knows both. This bound is what stops the obvious
 * nonsense (negative, zero, a million) before it reaches that check.
 */
export const MAX_TARGET_MINUTES = 7 * 24 * 60;

/** One day. The ceiling goal.service.js applies to a DAILY goal. */
export const MAX_DAILY_TARGET_MINUTES = 24 * 60;

/**
 * goals.targetMinutes is an Int in Postgres with no constraint of its own, so
 * this is the only thing bounding the column.
 *
 * .int() rather than accepting a float: a fractional target minute is
 * meaningless, and without it Prisma rejects the write at runtime with an error
 * nothing in the middleware translates - a 500 for what is plainly a bad
 * request. The same bug studyRoutine.validation.js documents for dueDate.
 */
const targetMinutesSchema = z
  .number({ message: "targetMinutes must be a number" })
  .int("targetMinutes must be a whole number of minutes")
  .min(1, "targetMinutes must be at least 1")
  .max(
    MAX_TARGET_MINUTES,
    `targetMinutes must be at most ${MAX_TARGET_MINUTES}`,
  );

/**
 * The period, as it appears in a URL.
 *
 * Lowercase on the wire, uppercase in the database. `/api/goals/daily` is what
 * anyone would type; GoalPeriod.DAILY is what Prisma wants. The transform is
 * the single place those two spellings are reconciled, so no controller or
 * service ever has to remember to do it.
 *
 * z.enum rather than a free string is what makes an unknown period a 400 naming
 * the valid values, instead of a Prisma error deep in a query.
 */
const periodSchema = z
  .enum(["daily", "weekly"], { message: "period must be daily or weekly" })
  .transform((value) => value.toUpperCase());

/**
 * GET, PUT and DELETE /api/goals/:period.
 *
 * Note there is NO goalIdParamSchema anywhere in this file. Addressing a goal
 * by its uuid would be the house convention, and it is deliberately not used:
 * @@unique([userId, period]) means a caller has at most one DAILY and one
 * WEEKLY goal, so the period already identifies the row completely, and an id
 * would force a client to list before it could read or write.
 */
export const goalPeriodParamSchema = z.strictObject({
  period: periodSchema,
});

/**
 * PUT /api/goals/:period.
 *
 * PUT rather than POST or PATCH because the operation is an UPSERT: setting a
 * daily target is the same request whether or not one already exists, and the
 * unique constraint means there is nothing to create a second of. That makes it
 * idempotent, which is what PUT means.
 *
 * userId is ABSENT by design - the service takes it from req.user.id. period is
 * absent too, and that one matters more than convenience: it lives in the path,
 * and accepting it in the body as well would create two sources of truth that a
 * client could disagree with itself about.
 */
export const upsertGoalSchema = z.strictObject({
  targetMinutes: targetMinutesSchema,
});
