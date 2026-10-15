/**
 * Formatting for study sessions - the live clock, the history and its detail
 * view.
 *
 * Hand-rolled rather than through Intl's date options, matching analytics: the
 * output must be identical on every device, and the strings are short enough
 * that a locale library would be more code than this.
 */

/** Shown wherever there is nothing to measure. Never a 0 that reads as a result. */
export const NONE = "—";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 45 -> "45m", 125 -> "2h 5m", 120 -> "2h", null -> "—". */
export const formatMinutes = (minutes: number | null): string => {
  if (minutes === null) return NONE;
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

/** Under a minute in seconds, otherwise as formatMinutes. */
export const formatSeconds = (seconds: number): string =>
  seconds < 60 ? `${seconds}s` : formatMinutes(Math.round(seconds / 60));

/**
 * A running clock: 125 -> "02:05", 3725 -> "1:02:05". Shared by the Study
 * tab's dial and the floating session bar, which show the same session and
 * must never disagree about how long it has run.
 */
export const formatClock = (totalSec: number): string => {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** "2:05pm", in the device's own zone. */
export const formatTime = (date: Date): string => {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? "am" : "pm"}`;
};

/** A local calendar-day key, so sessions group by the day the user lived them. */
export const localDayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Today", "Yesterday", "Tue 22 Sep", or "Tue 22 Sep 2025" outside this year. */
export const dayLabel = (date: Date, now: Date = new Date()): string => {
  if (localDayKey(date) === localDayKey(now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(date) === localDayKey(yesterday)) return "Yesterday";

  const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
};
