/**
 * The home feed's filter: which days, and in what order.
 *
 * Plain data and pure functions, no React - the screen holds one of these in
 * state, the filter page edits it, and usePosts turns it into a query string.
 * Keeping the conversion here means no component ever learns the API's
 * parameter names, which is the rule src/data/index.ts states.
 */

/**
 * The orders GET /api/posts/all accepts, spelled as the API spells them.
 *
 * Mirrors FEED_SORTS in apps/api/src/validation/post.validation.js. The API's
 * schema is strict, so a value that drifts from that list is a 400 rather than a
 * silently different order.
 */
export type FeedSort =
  | "recent"
  | "oldest"
  | "most_liked"
  | "least_liked"
  | "most_commented"
  | "least_commented";

/**
 * Any time, a span of days, or one day.
 *
 * All three keep their dates even when not selected, so flicking from Range to
 * Any time and back does not throw away the range someone just picked.
 */
export type FeedDateMode = "any" | "range" | "exact";

export interface FeedFilters {
  dateMode: FeedDateMode;
  /** Calendar days on the DEVICE's clock, as YYYY-MM-DD. */
  start: string;
  end: string;
  exact: string;
  sort: FeedSort;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** A local calendar day as YYYY-MM-DD - the form every date here is held in. */
export const toDayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Local midnight at the START of a day key.
 *
 * Built from parts rather than parsed: `new Date("2026-10-06")` is read as UTC
 * midnight, which is the previous evening anywhere west of Greenwich and the
 * wrong day's posts for most of this app's users.
 */
export const fromDayKey = (key: string): Date => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Local midnight at the start of the day AFTER the key - the exclusive end. */
const dayAfter = (key: string): Date => {
  const start = fromDayKey(key);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
};

/**
 * A fresh default: any date, newest first - exactly what the feed showed before
 * filters existed. A function rather than a constant, because "a week ago" and
 * "today" have to be worked out when the filter is reset, not when the app
 * started.
 */
export const defaultFeedFilters = (): FeedFilters => {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  return {
    dateMode: "any",
    start: toDayKey(weekAgo),
    end: toDayKey(today),
    exact: toDayKey(today),
    sort: "recent",
  };
};

/**
 * Whether the feed is unfiltered - what the dot on the filter button and the
 * Reset button's enabled state both read.
 *
 * Only the mode and the sort count. The stored dates are not a filter until a
 * date mode uses them.
 */
export const isDefaultFilters = (filters: FeedFilters): boolean =>
  filters.dateMode === "any" && filters.sort === "recent";

/** A range whose start falls after its end. Same-day is a valid one-day range. */
export const isRangeInvalid = (filters: FeedFilters): boolean =>
  filters.dateMode === "range" && filters.start > filters.end;

/**
 * The filter as GET /api/posts/all's query parameters, without page or limit.
 *
 * Calendar days become INSTANTS here, on the device, because only the device
 * knows which midnight "6 October" means. The API's window is half-open, so a
 * single day is its own midnight up to - not including - the next one.
 *
 * An invalid range sends NO window rather than one the API would refuse: the
 * filter page is already showing the error, and blanking the feed underneath it
 * over a half-picked range would punish the person mid-edit.
 */
export const toFeedQuery = (filters: FeedFilters): string => {
  // Assembled by hand: React Native's URLSearchParams is a partial polyfill
  // whose set() throws "not implemented" on some versions.
  const params: [string, string][] = [["sort", filters.sort]];

  if (filters.dateMode === "exact") {
    params.push(["from", fromDayKey(filters.exact).toISOString()]);
    params.push(["to", dayAfter(filters.exact).toISOString()]);
  } else if (filters.dateMode === "range" && !isRangeInvalid(filters)) {
    params.push(["from", fromDayKey(filters.start).toISOString()]);
    params.push(["to", dayAfter(filters.end).toISOString()]);
  }

  return params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
};
