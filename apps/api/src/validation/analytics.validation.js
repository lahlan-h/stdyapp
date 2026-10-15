import { z } from "zod";

import { canonicalTimeZone } from "../utils/timeZone.js";

/**
 * Request schemas for the analytics resource.
 *
 * strictObject, like every other schema here: a typo'd ?rnage=30d should be a
 * 400 naming the field, not a silent 7-day answer.
 */

/**
 * The windows a client may ask for, and how many days each covers.
 *
 * A fixed menu rather than a free ?days=N. Every distinct value is a distinct
 * cache entry, and the service loads roughly twice the window in sessions (the
 * range plus the one before it, for the comparison) - so an open-ended number
 * is both a cache-busting knob and a way to make one request read a user's
 * whole history. Adding "90d" later is a one-line change here.
 */
export const ANALYTICS_RANGES = {
  "7d": 7,
  "30d": 30,
};

/**
 * The longest zone name in the IANA database is 32 characters
 * ("America/Argentina/ComodRivadavia"). 64 leaves room without letting a
 * multi-kilobyte string reach Intl.
 */
const MAX_TIME_ZONE_LENGTH = 64;

/**
 * An IANA zone, returned in its canonical spelling.
 *
 * Validated by asking Intl rather than by pattern, because the only real test
 * of "is this a zone" is whether the runtime can format in it - a regex would
 * accept "Mars/Olympus_Mons". The transform means the service and the cache key
 * only ever see the canonical form.
 *
 * Defaults to UTC so a client that omits it still gets an answer, and one that
 * matches streaks and goals. The mobile app always sends it.
 */
const timeZoneSchema = z
  .string()
  .max(MAX_TIME_ZONE_LENGTH, "tz is too long")
  .transform((value, ctx) => {
    const canonical = canonicalTimeZone(value);
    if (!canonical) {
      ctx.addIssue({
        code: "custom",
        message: "tz must be an IANA timezone, e.g. Australia/Sydney",
      });
      return z.NEVER;
    }
    return canonical;
  })
  .default("UTC");

/**
 * GET /api/analytics/me.
 *
 * No userId anywhere: analytics are the caller's own, read from the token.
 * There is deliberately no /user/:userId counterpart - study history is private
 * in this API (see the note on cacheMyList in session.routes.js), and these
 * numbers are built from it.
 */
export const analyticsQuerySchema = z.strictObject({
  range: z
    .enum(Object.keys(ANALYTICS_RANGES), {
      message: `range must be one of ${Object.keys(ANALYTICS_RANGES).join(", ")}`,
    })
    .default("7d"),
  tz: timeZoneSchema,
});
