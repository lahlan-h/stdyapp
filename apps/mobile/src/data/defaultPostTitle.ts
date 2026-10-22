/**
 * The title a session's post takes when its author leaves the field empty,
 * named for when the session STARTED:
 *
 *   5am to before noon  -> "☀️ Morning study session"
 *   noon to before 6pm  -> "🌤️ Afternoon study session"
 *   6pm to before 5am   -> "🌙 Night study session"
 *
 * The start rather than the end, because that is when the person sat down to
 * study - a session begun at 11:40 and finished at 12:20 was a morning one.
 * In the device's own zone, which is the one the author lives in.
 */
export const defaultPostTitle = (startedAt: Date): string => {
  const hour = startedAt.getHours();
  if (hour >= 5 && hour < 12) return "☀️ Morning study session";
  if (hour >= 12 && hour < 18) return "🌤️ Afternoon study session";
  return "🌙 Night study session";
};
