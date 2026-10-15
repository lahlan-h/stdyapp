import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

/** What a board ranks by - mirrors LEADERBOARD_METRICS in focus.validation.js. */
export type LeaderboardMetric = "weightedMinutes" | "focusScore" | "tasksCompleted";

/** Who is on it - mirrors LEADERBOARD_SCOPES. */
export type LeaderboardScope = "following" | "global";

/** This week, or all time. Sent as `days=7` / `days=all`. */
export type LeaderboardRange = "week" | "all";

const RANGE_DAYS: Record<LeaderboardRange, string> = { week: "7", all: "all" };

/** One ranked person, as GET /api/focus/leaderboard answers it. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string | null;
  /** First and last name, or null - fall back to the username. */
  displayName: string | null;
  avatarUrl: string | null;
  /** Minutes, an average 0-100 estimate, or a count, depending on the metric. */
  value: number;
  sessions: number;
}

/** The caller's own row - present whether or not they made the board. */
export interface LeaderboardMe extends Omit<LeaderboardEntry, "rank"> {
  /** Null when they are not on the board (or are below the page on a global one). */
  rank: number | null;
  /** False until they have enough sessions for this metric to rank them. */
  qualified: boolean;
  sessionsNeeded: number;
}

export interface Leaderboard {
  scope: LeaderboardScope;
  metric: LeaderboardMetric;
  days: number | "all";
  since: string | null;
  /** Only set on the focus board, which needs this many scored sessions. */
  minScoredSessions: number | null;
  /** How many people the caller follows; null on a global board. */
  followingCount: number | null;
  entries: LeaderboardEntry[];
  me: LeaderboardMe;
}

export interface LeaderboardState {
  board?: Leaderboard;
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
}

/**
 * A ranked board of the signed-in user and the people they follow.
 *
 * Refetches when the metric or range changes, keeping the previous board on
 * screen while the next loads - the same in-place swap useAnalytics does, so a
 * tab tap never flashes an empty list.
 */
export const useLeaderboard = (
  metric: LeaderboardMetric,
  range: LeaderboardRange,
  scope: LeaderboardScope = "following",
): LeaderboardState => {
  const [board, setBoard] = useState<Leaderboard | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  /** Which request is current, so a slow earlier tab cannot land last. */
  const latest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latest.current;
    setIsLoading(true);

    const query = `scope=${scope}&metric=${metric}&days=${RANGE_DAYS[range]}`;

    try {
      const { data } = await withAuth((token) =>
        request<{ data: Leaderboard }>(`/api/focus/leaderboard?${query}`, { token }),
      );
      if (requestId !== latest.current) return;
      setBoard(data);
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describe(err));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, [metric, range, scope]);

  useEffect(() => {
    load();
  }, [load]);

  return { board, isLoading, loadError, reload: load };
};

const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) return "Could not load the leaderboard.";

  switch (err.status) {
    case 429:
      return err.retryAfter
        ? `Too many refreshes. Try again in ${err.retryAfter}s.`
        : "Too many refreshes. Try again shortly.";
    default:
      return err.message;
  }
};
