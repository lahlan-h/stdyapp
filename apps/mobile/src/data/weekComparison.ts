/**
 * This calendar week against last, for the analytics card on the Study tab.
 *
 * Derived from the per-day minutes GET /api/analytics/me already returns, so
 * the card needs no API of its own: a 30-day range always holds both weeks,
 * because last week's Monday is at most 13 days back. The full analytics page
 * keeps its rolling 7- and 30-day windows; this is the one place that thinks in
 * Monday-to-Sunday weeks, because that is how the design draws the chart.
 *
 * The API's arithmetic stays the API's - this only regroups days it has
 * already totalled and adds them up.
 */

export interface WeekComparison {
  /** Minutes per day, Monday first. Days still to come this week are null, not 0. */
  thisWeek: (number | null)[];
  /** Minutes per day, Monday first. */
  lastWeek: number[];
  /** This week so far. */
  thisWeekMinutes: number;
  /**
   * This week so far against the SAME days last week - Monday to today on both
   * sides. Against the whole of last week, every Monday would read as a slump.
   *
   * Null when last week had nothing on those days, the API's own rule for its
   * change figures: "up from nothing" is not a percentage.
   */
  changePercent: number | null;
}

interface DailyMinutes {
  /** "YYYY-MM-DD" in the user's zone - a label, not an instant. */
  date: string;
  minutes: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDay = (key: string): number => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/**
 * A day label moved by whole days. Done on UTC midnights, where every day is
 * exactly 24 hours, so a daylight-saving change cannot land it on the wrong
 * date the way local-time arithmetic can.
 */
const shiftKey = (key: string, days: number): string =>
  new Date(toUtcDay(key) + days * DAY_MS).toISOString().slice(0, 10);

/** 0 for Monday through 6 for Sunday. getUTCDay starts the week on Sunday. */
const mondayIndex = (key: string): number => (new Date(toUtcDay(key)).getUTCDay() + 6) % 7;

const sum = (values: (number | null)[]): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * @param daily    the API's focusTime.daily, for a range ending today
 * @param todayKey the API's range.to - today in the user's zone, which the
 *                 device's own clock could disagree with near midnight
 */
export const toWeekComparison = (daily: DailyMinutes[], todayKey: string): WeekComparison => {
  const minutesOn = new Map(daily.map(({ date, minutes }) => [date, minutes]));
  const today = mondayIndex(todayKey);
  const monday = shiftKey(todayKey, -today);

  const thisWeek = Array.from({ length: 7 }, (_, day) =>
    day <= today ? (minutesOn.get(shiftKey(monday, day)) ?? 0) : null,
  );
  const lastWeek = Array.from(
    { length: 7 },
    (_, day) => minutesOn.get(shiftKey(monday, day - 7)) ?? 0,
  );

  const thisWeekMinutes = sum(thisWeek);
  const lastWeekToDate = sum(lastWeek.slice(0, today + 1));

  return {
    thisWeek,
    lastWeek,
    thisWeekMinutes,
    changePercent:
      lastWeekToDate > 0
        ? Math.round(((thisWeekMinutes - lastWeekToDate) / lastWeekToDate) * 100)
        : null,
  };
};
