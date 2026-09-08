const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const MILLIS_PER_MIN = 60000;

export const formatRelativeTime = (timestamp: number): string => {
  const minutes = Math.floor((Date.now() - timestamp) / MILLIS_PER_MIN);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 60) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export const formatTime = (durationMinutes: number): string => {
  const totalMinutes = Math.floor(durationMinutes);

  if (totalMinutes <= 0) return "Invalid Time";
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes}m`;

  if (totalMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    return `${hours}h ${minutes}m`;
  }

  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  return `${days}d ${hours}h`;
};
