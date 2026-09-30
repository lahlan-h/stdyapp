import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

/** The windows the API accepts - mirrors ANALYTICS_RANGES in analytics.validation.js. */
export type AnalyticsRange = "7d" | "30d";

/**
 * How often a goal was met. `counted` excludes today (or this week) until it is
 * met, so a morning check does not read as a missed day - see hitRate in
 * analytics.service.js.
 */
export interface GoalHitRate {
  targetMinutes: number;
  met: number;
  counted: number;
  hitRatePercent: number | null;
}

/**
 * GET /api/analytics/me, as the API answers it.
 *
 * Every nullable number is null for the same reason: there was nothing to
 * divide by (no sessions, no study last period, no interruptions). The screen
 * shows a dash, never a 0% that would read as a result.
 */
export interface Analytics {
  range: {
    key: AnalyticsRange;
    days: number;
    /** "YYYY-MM-DD" in `timeZone`. */
    from: string;
    to: string;
    timeZone: string;
  };
  focusTime: {
    totalMinutes: number;
    previousTotalMinutes: number;
    changePercent: number | null;
    daily: { date: string; minutes: number }[];
  };
  sessions: {
    count: number;
    averageMinutes: number | null;
    longestMinutes: number | null;
    soloMinutes: number;
    groupMinutes: number;
  };
  focusQuality: {
    focusPoints: number;
    efficiencyPercent: number | null;
    interruptionCount: number;
    penaltyCount: number;
    interruptionsPerHour: number | null;
    averageAwaySec: number | null;
  };
  goals: {
    daily: GoalHitRate | null;
    weekly: GoalHitRate | null;
  };
  consistency: {
    activeDays: number;
    activeDayPercent: number | null;
    longestRunDays: number;
    currentStreak: number;
    isActiveToday: boolean;
  };
  peakHours: {
    /** 24 entries, index = local hour. */
    hourly: number[];
    peakHour: number | null;
  };
}

export interface AnalyticsState {
  analytics?: Analytics;
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
}

/**
 * The device's IANA zone, so "Tuesday" and "9am" on the screen mean the
 * user's Tuesday and 9am rather than the server's UTC ones.
 *
 * Read on every request rather than once at import: a phone that lands in
 * another timezone mid-session should get that zone's days on the next load.
 * UTC is the fallback for an engine without Intl zone data, and it is also
 * the API's own default, so the answer is still consistent - just in UTC days.
 */
const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/**
 * The signed-in user's study analytics for a range.
 *
 * Refetches when the range changes. Keeps the PREVIOUS range's numbers on
 * screen while the next ones load, so switching 7d -> 30d swaps the numbers in
 * place instead of flashing an empty screen.
 */
export const useAnalytics = (range: AnalyticsRange): AnalyticsState => {
  const [analytics, setAnalytics] = useState<Analytics | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  /**
   * Which request is current. Tapping 7d, 30d, 7d quickly fires three
   * requests that can resolve in any order; without this, a slow 30d response
   * could land last and put 30-day numbers under a 7-day label.
   */
  const latest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latest.current;
    setIsLoading(true);

    const query = `range=${range}&tz=${encodeURIComponent(deviceTimeZone())}`;

    try {
      const data = await withAuth((token) =>
        request<Analytics>(`/api/analytics/me?${query}`, { token }),
      );
      if (requestId !== latest.current) return;
      setAnalytics(data);
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describe(err));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return { analytics, isLoading, loadError, reload: load };
};

const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) return "Could not load your analytics.";

  switch (err.status) {
    case 429:
      return err.retryAfter
        ? `Too many refreshes. Try again in ${err.retryAfter}s.`
        : "Too many refreshes. Try again shortly.";
    default:
      return err.message;
  }
};
