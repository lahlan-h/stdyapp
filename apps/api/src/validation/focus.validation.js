import { z } from "zod";

import { timeZoneSchema } from "./analytics.validation.js";

/**
 * Request schemas for the focus-estimate endpoints.
 *
 * Named validation/ rather than schemas/ so "schema" keeps meaning the Prisma
 * schema in conversation - the same convention as user.validation.js.
 */

/**
 * A hard cap, not a suggestion. Sample ingest is the one endpoint in this
 * feature a client hits repeatedly during a live session, and without a ceiling
 * a single request could insert an unbounded number of rows into the
 * fastest-growing table in the database.
 *
 * 500 is generous: at one sample every 30 seconds it is over four hours of
 * study in a single call.
 */
export const MAX_SAMPLES_PER_BATCH = 500;

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/**
 * Plausible human heart rates. Not a clinical range - a filter against garbage.
 * A watch reporting 0 or 900 BPM has malfunctioned, and letting that reading
 * into the baseline would corrupt the user's calibration for every future
 * session, long after the bad sample itself was forgotten.
 */
const MIN_HEART_RATE = 20;
const MAX_HEART_RATE = 250;

const MIN_SELF_RATING = 1;
const MAX_SELF_RATING = 5;

/**
 * Accelerometer magnitude variance in g^2. Non-negative because it is a
 * variance; the upper bound rejects readings no phone in a pocket produces.
 */
const MAX_MOTION_VARIANCE = 1000;

/**
 * sessions.id is TEXT in Postgres rather than a native uuid column, so an
 * invalid id would otherwise simply miss and return a confusing 404. Checking
 * the shape here upgrades that to a 400 that says what is actually wrong.
 */
export const sessionIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

/**
 * One sampling interval.
 *
 * `timestamp` is optional and client-supplied. The client owns it because
 * samples are buffered offline and uploaded in batches, so the moment a row
 * reaches the server says nothing about when it was recorded. It is coerced
 * from an ISO string, and the service clamps it into the session's own window -
 * a client must not be able to backdate a sample into someone else's session.
 *
 * `hr` accepts null explicitly as well as being omittable: a watch-equipped
 * client sending a steady stream of samples through a dropout should be able to
 * say "no reading" rather than having to restructure its payload.
 */
export const focusSampleSchema = z.strictObject({
  timestamp: z.coerce.date().optional(),
  hr: z
    .number()
    .int()
    .min(MIN_HEART_RATE, `hr must be at least ${MIN_HEART_RATE}`)
    .max(MAX_HEART_RATE, `hr must be at most ${MAX_HEART_RATE}`)
    .nullable()
    .optional(),
  motionVariance: z
    .number()
    .min(0, "motionVariance must not be negative")
    .max(MAX_MOTION_VARIANCE, "motionVariance is implausibly large"),
  inApp: z.boolean(),
});

/**
 * strictObject with a named `samples` array rather than a bare top-level array:
 * a bare array cannot grow a sibling field later without breaking every client,
 * and this endpoint will want one (a device identifier, a batch sequence
 * number) before long.
 */
export const createFocusSamplesSchema = z.strictObject({
  samples: z
    .array(focusSampleSchema)
    .min(1, "samples must not be empty")
    .max(
      MAX_SAMPLES_PER_BATCH,
      `samples must contain at most ${MAX_SAMPLES_PER_BATCH} entries`,
    ),
});

/**
 * The user's own verdict, which is the ground truth calibration is measured
 * against. Integer 1-5: a slider, not a free-text mood.
 */
export const focusRatingSchema = z.strictObject({
  selfRating: z.coerce
    .number()
    .int("selfRating must be a whole number")
    .min(MIN_SELF_RATING, `selfRating must be at least ${MIN_SELF_RATING}`)
    .max(MAX_SELF_RATING, `selfRating must be at most ${MAX_SELF_RATING}`),
});

/**
 * Query params always arrive as strings, hence z.coerce. The page size is
 * larger than the users endpoint's because this backs a timeline chart, which
 * wants a whole session at once rather than a screenful.
 */
export const listSamplesQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

/** What a board ranks by. Mirrors METRICS in services/focusLeaderboard.js. */
export const LEADERBOARD_METRICS = ["weightedMinutes", "focusScore", "tasksCompleted"];

/**
 * Who a board is about: the people the caller follows plus the caller,
 * everyone, or the members of one study group the caller belongs to.
 */
export const LEADERBOARD_SCOPES = ["following", "global", "group"];

/**
 * GET /api/focus/leaderboard.
 *
 * `days` rather than `weeks` so "today" and "yesterday" boards are expressible
 * without a second parameter; 7 is the default because the weekly board is the
 * one in the pitch. A number is capped at a term's worth; the literal "all" is
 * the all-time board. That is a word rather than a large number so there is
 * exactly one spelling of it, and the default "following" scope bounds what it
 * reads to one person's follow list.
 *
 * The literal "week" is the CALENDAR week so far: from Monday midnight in `tz`
 * (UTC if omitted), the same week the app's weekly card and weekly goal count.
 * A number is a rolling window, so days=7 on a Monday still reaches back into
 * last week - which is why a screen that says "this week" asks for "week".
 * `tz` only means something to "week", and is refused anywhere else, as a
 * stray groupId is.
 *
 * `scope` defaults to "following" because comparing yourself with your friends
 * is the social loop; a global board of strangers is the opt-in. "group" is a
 * study group's own board, opened from that group's feed, and names the group
 * with `groupId`.
 */
export const leaderboardQuerySchema = z
  .strictObject({
    scope: z
      .enum(LEADERBOARD_SCOPES, {
        message: `scope must be one of ${LEADERBOARD_SCOPES.join(", ")}`,
      })
      .default("following"),
    groupId: z.uuid("groupId must be a UUID").optional(),
    metric: z
      .enum(LEADERBOARD_METRICS, {
        message: `metric must be one of ${LEADERBOARD_METRICS.join(", ")}`,
      })
      .default("weightedMinutes"),
    days: z
      .union([z.literal("all"), z.literal("week"), z.coerce.number().int().min(1).max(120)], {
        message: `days must be a whole number from 1 to 120, "week" or "all"`,
      })
      .default(7),
    tz: timeZoneSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  // Both directions are a 400, as on the feed's audience: a group board with
  // no group has nobody to rank, and a stray groupId on any other scope would
  // be silently ignored - a client bug that should say so.
  .refine((query) => (query.scope === "group") === Boolean(query.groupId), {
    message: "groupId is required with scope=group, and only then",
    path: ["groupId"],
  })
  // A rolling window starts N days before now wherever the caller is, so a tz
  // there would change nothing - a client that sends one expects it to.
  .refine((query) => query.tz === undefined || query.days === "week", {
    message: "tz only applies to days=week",
    path: ["tz"],
  });

/** Length of one checklist item. Long enough for a real task, short enough
 *  that the row stays readable in a list. */
const MAX_TASK_TITLE = 120;

/** Mirrors MAX_TASKS_PER_SESSION in focus.service.js. */
const MAX_TASKS_PER_REQUEST = 30;

const taskTitleSchema = z
  .string()
  .trim()
  .min(1, "a task needs a title")
  .max(MAX_TASK_TITLE, `a task title must be at most ${MAX_TASK_TITLE} characters`);

/**
 * POST /api/sessions/:id/tasks.
 *
 * An ARRAY, because the setup screen collects a whole checklist before the
 * session exists and then sends it in one go - a request per item would be a
 * burst of writes for one user action, and a half-failed checklist.
 */
export const createTasksSchema = z.strictObject({
  titles: z
    .array(taskTitleSchema)
    .min(1, "titles must not be empty")
    .max(MAX_TASKS_PER_REQUEST, `at most ${MAX_TASKS_PER_REQUEST} tasks at a time`),
});

/** PATCH /api/sessions/:id/tasks/:taskId. */
export const updateTaskSchema = z.strictObject({
  isComplete: z.boolean(),
});

/** Both ids, since a task is only ever addressed through its session. */
export const taskParamsSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
  taskId: z.uuid("taskId must be a UUID"),
});
