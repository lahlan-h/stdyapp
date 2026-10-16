/** What a board ranks by - mirrors LEADERBOARD_METRICS in focus.validation.js. */
export type LeaderboardMetric = "weightedMinutes" | "focusScore" | "tasksCompleted";

/** Who is on it - mirrors LEADERBOARD_SCOPES. */
export type LeaderboardScope = "following" | "global" | "group";

/** This week, or all time. Sent as `days=week` / `days=all`. */
export type LeaderboardRange = "week" | "all";

/**
 * "week" is the CALENDAR week so far, Monday midnight to now in the device's
 * zone - the week the weekly card on Analytics counts, so the two never
 * disagree about which days "this week" is. Not days=7: seven days back from a
 * Wednesday still reaches last Thursday.
 */
const RANGE_DAYS: Record<LeaderboardRange, string> = { week: "week", all: "all" };

/**
 * The query string for GET /api/focus/leaderboard.
 *
 * Apart from useLeaderboard so it can be tested without React. The zone goes
 * only with the week: the API refuses one on an all-time board, where it would
 * change nothing.
 */
export const leaderboardQuery = ({
  metric,
  range,
  groupId,
  timeZone,
}: {
  metric: LeaderboardMetric;
  range: LeaderboardRange;
  /** Set for a group's own board; the API refuses a groupId anywhere else. */
  groupId?: string;
  timeZone: string;
}): string => {
  const scope = groupId
    ? `scope=group&groupId=${encodeURIComponent(groupId)}`
    : "scope=following";
  const zone = range === "week" ? `&tz=${encodeURIComponent(timeZone)}` : "";
  return `${scope}&metric=${metric}&days=${RANGE_DAYS[range]}${zone}`;
};
