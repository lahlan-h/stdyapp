/**
 * How times read in messages - the conversation list's time column and the
 * chat's day separators and bubble times. In one place so the list and the
 * chat can never describe the same moment two different ways.
 *
 * Everything is the DEVICE's calendar: "Today" means today where the reader
 * is, which is the only today they care about.
 */

const MS_PER_DAY = 86_400_000;

/** Local midnight at the start of the day `ms` falls in. */
const startOfDay = (ms: number): number => {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * Whole calendar days between `ms` and now. Rounded rather than floored, so a
 * daylight-saving day of 23 or 25 hours still counts as one.
 */
const daysAgo = (ms: number, now: number): number =>
  Math.round((startOfDay(now) - startOfDay(ms)) / MS_PER_DAY);

export const isSameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

/** "9:41 am" - the time under a run of bubbles, and today's rows in the list. */
export const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "3 Oct", with the year only when it is not this one. */
const shortDate = (ms: number, now: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(new Date(ms).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  });

/** A chat's day separator: "Today", "Yesterday", or a date. */
export const dayLabel = (ms: number, now = Date.now()): string => {
  const days = daysAgo(ms, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return shortDate(ms, now);
};

/**
 * The conversation list's time column: a clock time today, then "Yesterday",
 * then the weekday within the week, then a date - the more recent, the more
 * precise, because that is where precision is useful.
 */
export const listTime = (ms: number, now = Date.now()): string => {
  const days = daysAgo(ms, now);
  if (days <= 0) return clockTime(ms);
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  return shortDate(ms, now);
};
