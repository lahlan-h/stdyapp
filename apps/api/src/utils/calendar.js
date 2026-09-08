/**
 * Calendar-day arithmetic for streaks and goals.
 *
 * ⚠ EVERYTHING HERE IS UTC, AND THAT IS A KNOWN LIMITATION rather than a
 * considered preference. It is written down once, here, because streaks and
 * goals both depend on it and a caveat repeated in two files is a caveat that
 * eventually disagrees with itself.
 *
 * The problem: "did they study yesterday" and "how much have they studied
 * today" are questions about the user's calendar, and the server does not know
 * which calendar that is. This app's users are in Sydney, where UTC+10 puts the
 * day boundary at 10am local - so a session finished at 9am Tuesday counts
 * towards MONDAY, and someone studying every morning could watch a streak they
 * have genuinely earned fail to advance.
 *
 * THE REAL FIX is a timezone column on User, populated from the device at
 * signup, and these functions taking it as an argument. That is a schema change
 * and a migration, so it is deliberately not bundled into the change that
 * introduced these entities - but it should land before anyone relies on a
 * streak being correct, because a wrong streak is worse than no streak.
 *
 * Storing the OFFSET rather than the zone name would be the tempting shortcut
 * and is wrong: Sydney observes daylight saving, so an offset captured in June
 * is an hour out from October, and the day boundary would silently move.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Date.prototype.getUTCDay() numbers Sunday as 0. This app treats Monday as the
// first day of the week, which is both the Australian convention and the one
// every calendar UI the team is likely to build defaults to.
const MONDAY = 1;
const DAYS_PER_WEEK = 7;

/**
 * Midnight UTC on the day the given instant falls in.
 *
 * Built with Date.UTC from the extracted parts rather than by zeroing the time
 * with setHours, which operates in the SERVER's local zone - a container set to
 * anything but UTC would then produce a boundary that drifts with deployment
 * environment, which is the worst kind of this bug because it is invisible in
 * development.
 *
 * The result is what a @db.Date column round-trips to, so a value from here can
 * be compared to streaks.lastActiveDate by getTime() without further
 * normalising.
 *
 * @param {Date} date
 * @returns {Date}
 */
export const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Midnight UTC on the Monday of the week the given instant falls in.
 *
 * The `+ 6) % 7` is what remaps Sunday from 0 to 6 so it belongs to the week
 * that is ENDING rather than starting one of its own. Without it a Sunday
 * session would be counted against a fresh week, and a weekly goal would reset
 * a day early every week.
 *
 * @param {Date} date
 * @returns {Date}
 */
export const startOfUtcWeek = (date) => {
  const day = startOfUtcDay(date);
  const offsetFromMonday = (day.getUTCDay() - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;

  return new Date(day.getTime() - offsetFromMonday * MILLISECONDS_PER_DAY);
};

/**
 * Whole days between two midnight-UTC dates, as `later - earlier`.
 *
 * Safe as plain subtraction ONLY because both arguments are midnight UTC, where
 * every day is exactly 86,400,000 ms. That is not true of wall-clock days in a
 * zone with daylight saving, which is the second reason this module works in
 * UTC rather than converting first and subtracting after.
 *
 * @param {Date} later
 * @param {Date} earlier
 * @returns {number}
 */
export const differenceInUtcDays = (later, earlier) =>
  Math.round((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_DAY);
