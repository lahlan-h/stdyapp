import { z } from "zod";

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
