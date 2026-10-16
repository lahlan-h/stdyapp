/**
 * The arithmetic of the leaderboard: who qualifies, how ties rank, and what
 * one row looks like on the wire.
 *
 * Kept apart from focus.service.js for the reason focusScoring.js is: this
 * file touches no I/O, so it is tested directly, and the service is left to
 * decide only WHICH rows to load.
 */

/**
 * What a board can rank by. The values double as the `metric` query param and
 * mirror LEADERBOARD_METRICS in focus.validation.js.
 */
export const METRICS = Object.freeze({
  WEIGHTED_MINUTES: "weightedMinutes",
  FOCUS_SCORE: "focusScore",
  TASKS_COMPLETED: "tasksCompleted",
});

/**
 * Scored sessions a user needs in the window before their AVERAGE focus
 * estimate is ranked.
 *
 * Without a floor, one lucky 10-minute session at 98 would top a board that
 * someone else earned across a week of real study. Three is the smallest
 * number where an average says something about a person rather than a
 * session, and still reachable inside a single week.
 */
export const MIN_SCORED_SESSIONS = 3;

/**
 * Sessions needed to appear on a board for this metric.
 *
 * @param {string} metric
 * @returns {number}
 */
export const minSessionsFor = (metric) =>
  metric === METRICS.FOCUS_SCORE ? MIN_SCORED_SESSIONS : 1;

/**
 * Who a bounded board is about: everyone the caller follows (a "following"
 * board) or every member of a group (a "group" board), plus the caller, minus
 * anyone on either side of a block.
 *
 * The caller is included so their own row ranks among the people they compare
 * themselves with - a board of only other people would never say "you're 3rd".
 * A group roll already contains the caller; the Set keeps them once.
 *
 * @param {string} userId
 * @param {string[]} peopleIds - who the caller follows, or the group's members
 * @param {string[]} blockedIds
 * @returns {string[]}
 */
export const audienceIds = (userId, peopleIds, blockedIds) => {
  const blocked = new Set(blockedIds);
  const ids = new Set([userId, ...peopleIds]);
  return [...ids].filter((id) => id === userId || !blocked.has(id));
};

/**
 * Ranks aggregated rows, biggest first.
 *
 * Competition ranking (1, 2, 2, 4): two people with the same total share a
 * place, and the next person is still ranked by how many beat them. Ties are
 * listed in userId order so the page is stable between refreshes.
 *
 * Rows below the metric's session floor are dropped here as well as in the
 * query, so a caller that forgot the HAVING still cannot rank one session.
 *
 * @param {Array<{ userId: string, value: number, sessions: number }>} rows
 * @param {string} metric
 * @returns {Array<{ rank: number, userId: string, value: number, sessions: number }>}
 */
export const rankRows = (rows, metric) => {
  const floor = minSessionsFor(metric);
  const sorted = rows
    .filter((row) => row.sessions >= floor)
    .sort((a, b) => b.value - a.value || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || row.value !== sorted[i - 1].value) rank = i + 1;
    return { rank, ...row };
  });
};

/**
 * Rounds a metric for display. Ranking always happens on the raw value first,
 * so rounding can never reorder the board.
 *
 * @param {string} metric
 * @param {number|null} value
 */
export const roundValue = (metric, value) => {
  if (value === null || value === undefined) return 0;
  if (metric === METRICS.TASKS_COMPLETED) return Math.round(value);
  return Math.round(value * 10) / 10;
};

/**
 * "Ada Lovelace", "Ada", or null - never the username, so a client can tell
 * the two apart and fall back as it chooses.
 *
 * @param {{ firstName?: string|null, lastName?: string|null } | undefined} user
 * @returns {string|null}
 */
export const toDisplayName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
};

/**
 * One row as the API answers it.
 *
 * @param {{ rank: number|null, userId: string, value: number, sessions: number }} row
 * @param {{ username: string, firstName?: string|null, lastName?: string|null, avatarUrl?: string|null } | undefined} user
 * @param {string} metric
 */
export const toEntry = (row, user, metric) => ({
  rank: row.rank,
  userId: row.userId,
  username: user?.username ?? null,
  displayName: toDisplayName(user),
  avatarUrl: user?.avatarUrl ?? null,
  value: roundValue(metric, row.value),
  sessions: row.sessions,
});

/**
 * The caller's own row, returned whether or not they made the page.
 *
 * Their rank comes from the FULL ranked list when the service has it (a
 * following board is loaded whole), so "you're 27th" still works off the first
 * page; on a global board only the top `limit` are loaded, and a rank outside
 * it is null rather than a guess.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.metric
 * @param {{ value: number|null, sessions: number }} args.mine - the caller's aggregate
 * @param {Array<{ rank: number, userId: string }>} args.ranked
 * @param {object | undefined} args.user
 */
export const buildMe = ({ userId, metric, mine, ranked, user }) => {
  const floor = minSessionsFor(metric);
  const placed = ranked.find((row) => row.userId === userId);
  return {
    ...toEntry(
      { rank: placed?.rank ?? null, userId, value: mine.value ?? 0, sessions: mine.sessions },
      user,
      metric,
    ),
    // Says plainly why a user with sessions has no rank on the focus board,
    // rather than leaving a client to compare sessions with a constant.
    qualified: mine.sessions >= floor,
    sessionsNeeded: Math.max(0, floor - mine.sessions),
  };
};
