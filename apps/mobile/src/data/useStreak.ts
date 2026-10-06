import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";

/**
 * GET /api/streaks/me, as the service answers it.
 *
 * ⚠ currentCount is the EFFECTIVE streak, not the stored column. Nothing runs
 * at midnight to break a lapsed streak - there is no scheduler in the API - so
 * the table can still hold a ten-day streak for someone who stopped in August.
 * The service compares lastActiveDate against today and serves 0 when the run
 * is dead, which is why this must never be recomputed on the device.
 *
 * isActiveToday is sent for the same reason: working it out here would use the
 * DEVICE's timezone and disagree with the server for several hours a day.
 *
 * There is no longest-streak field. The Streak model stores currentCount and
 * lastActiveDate and nothing else, so a "best ever" figure would have to be
 * invented - see schema.prisma.
 */
export interface Streak {
  id: string | null;
  userId: string;
  currentCount: number;
  lastActiveDate: string | null;
  isActiveToday: boolean;
}

export interface StreakState {
  streak?: Streak;
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * One user's study streak.
 *
 * @param userId - whose streak. Defaults to the caller's own, which uses
 *   GET /api/streaks/me; any other id uses GET /api/streaks/user/:userId. Both
 *   answer the same shape - the second exists because a streak nobody else can
 *   see is a private note to self.
 */
export const useStreak = (userId?: string): StreakState => {
  const [streak, setStreak] = useState<Streak | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const path =
    !userId || userId === "me" ? "/api/streaks/me" : `/api/streaks/user/${userId}`;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await withAuth((token) => request<Streak>(path, { token }));
      setStreak(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your streak.");
    } finally {
      setIsLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { streak, isLoading, error, reload: load };
};
