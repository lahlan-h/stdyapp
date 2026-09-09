const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
const MILLIS_PER_MINUTE = 60_000;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/**
 * A timestamp as "3 minutes ago" / "5 hours ago" / "2 days ago".
 *
 * @param timestamp epoch milliseconds
 */
export const formatRelativeTime = (timestamp: number): string => {
  const minutes = Math.floor((Date.now() - timestamp) / MILLIS_PER_MINUTE);

  if (minutes < 1) return "Just now";
  if (minutes < MINUTES_PER_HOUR) return plural(minutes, "minute");

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);

  // Was `hours < 60`, so anything up to two and a half days read as
  // "50 hours ago" instead of rolling over into days.
  if (hours < HOURS_PER_DAY) return plural(hours, "hour");

  return plural(Math.floor(hours / HOURS_PER_DAY), "day");
};

/**
 * A study-session length in minutes as "45m" / "1h 20m" / "2d 3h".
 *
 * Renamed from formatTime, which did not say what it formatted - it takes a
 * duration, not a point in time.
 */
export const formatDuration = (durationMinutes: number): string => {
  const totalMinutes = Math.floor(durationMinutes);

  // A zero-length session is a real, if unusual, value; only a negative one is
  // nonsense. The old version rejected 0 as "Invalid Time".
  if (totalMinutes < 0) return "0m";
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes}m`;

  if (totalMinutes < MINUTES_PER_DAY) {
    return `${Math.floor(totalMinutes / MINUTES_PER_HOUR)}h ${totalMinutes % MINUTES_PER_HOUR}m`;
  }

  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  return `${days}d ${hours}h`;
};
