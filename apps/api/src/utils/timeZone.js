/**
 * Calendar arithmetic in a CALLER-SUPPLIED timezone, for analytics.
 *
 * This is the other half of the limitation utils/calendar.js documents. That
 * module works in UTC because streaks and goals are written by endSession,
 * where the server has no idea which calendar the user lives on. Analytics is a
 * READ, and a read can simply be told: the app sends its IANA zone as ?tz=, so
 * "Tuesday" and "9am" here mean the user's Tuesday and the user's 9am.
 *
 * Nothing in calendar.js changes, and streaks and goals keep their UTC days.
 * That means a streak and a daily chart can disagree about which day a
 * 9am-Sydney session belongs to - the chart is the one that is right. The fix
 * for streaks is still the User.timezone column calendar.js describes, and when
 * it lands, these functions can take that column instead of a query param.
 *
 * DAYS ARE PASSED AROUND AS "YYYY-MM-DD" KEYS, not Dates. A Date is an instant,
 * and "the 22nd in Sydney" is not an instant - it is a label. Doing arithmetic
 * on the label (see shiftDateKey) sidesteps daylight saving completely: the day
 * before the 6th of October is the 5th whether that day was 23, 24 or 25 hours
 * long.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Monday-first, matching startOfUtcWeek in calendar.js.
const DAYS_PER_WEEK = 7;

/**
 * One formatter per zone, built on first use.
 *
 * Intl.DateTimeFormat construction is the expensive part (it loads zone data),
 * and bucketing a month of sessions calls formatToParts hundreds of times with
 * the same zone. The cache is bounded in practice by the number of distinct
 * zones clients send, which validation limits to real IANA names.
 *
 * en-CA is chosen for nothing but its field order; formatToParts is read by
 * type, so the locale never affects the output.
 */
const formatters = new Map();

const formatterFor = (timeZone) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      // h23, not hour12: false. hour12: false renders midnight as "24" in some
      // engines, which would put 12am sessions in a 25th bucket.
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/**
 * The canonical spelling of a zone, or null if it is not one.
 *
 * Canonical matters for the cache: "australia/sydney" and "Australia/Sydney"
 * are the same zone, and without normalising they would be two cache entries
 * for one answer.
 *
 * @param {string} timeZone
 * @returns {string | null}
 */
export const canonicalTimeZone = (timeZone) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    // RangeError for an unknown zone. Anything else is equally "not a zone".
    return null;
  }
};

/**
 * Where an instant falls on the given zone's wall clock.
 *
 * @param {Date} date
 * @param {string} timeZone - already canonical
 * @returns {{ dateKey: string, hour: number }}
 */
export const localParts = (date, timeZone) => {
  const parts = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(date)) {
    parts[type] = value;
  }

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
};

/**
 * Parses a date key as midnight UTC, purely as a vehicle for arithmetic.
 *
 * The UTC here is not a timezone claim - it is the one zone with no daylight
 * saving, so adding N days of milliseconds always lands on the right label.
 */
const keyToUtcDate = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const utcDateToKey = (date) => date.toISOString().slice(0, 10);

/**
 * The date key `days` days after (or, negative, before) the given one.
 *
 * @param {string} dateKey @param {number} days
 * @returns {string}
 */
export const shiftDateKey = (dateKey, days) =>
  utcDateToKey(new Date(keyToUtcDate(dateKey).getTime() + days * MILLISECONDS_PER_DAY));

/**
 * The Monday of the week a date key falls in, as a date key.
 *
 * The `+ 6) % 7` remaps Sunday from 0 to 6, for the reason startOfUtcWeek
 * gives: Sunday ends a week rather than starting its own.
 *
 * @param {string} dateKey
 * @returns {string}
 */
export const weekStartKey = (dateKey) => {
  const offsetFromMonday = (keyToUtcDate(dateKey).getUTCDay() + 6) % DAYS_PER_WEEK;
  return shiftDateKey(dateKey, -offsetFromMonday);
};

/**
 * The `count` consecutive date keys ending at (and including) `lastKey`,
 * oldest first - the order a chart's x axis reads in.
 *
 * @param {string} lastKey @param {number} count
 * @returns {string[]}
 */
export const dateKeysEndingAt = (lastKey, count) =>
  Array.from({ length: count }, (_, index) => shiftDateKey(lastKey, index - (count - 1)));
