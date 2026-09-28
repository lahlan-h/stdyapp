import { useCallback, useEffect, useMemo, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";

/**
 * One row of GET /api/sessions.
 *
 * Declared structurally rather than generated, the way RawFeedRow is: only the
 * columns something here reads are listed, so a column added to the table does
 * not ripple into this app.
 */
interface RawSession {
  id: string;
  startedAt: string;
  /** Null while a session is still running - NOT the same as a duration of zero. */
  endedAt: string | null;
}

export interface StudyTotals {
  /** Sessions that have ended. A running one is not yet a session studied. */
  completed: number;
  /** Summed minutes across completed sessions. */
  minutes: number;
}

export interface StudySessionsState {
  totals?: StudyTotals;
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * Floored at zero, matching how the API derives a post's session duration: a
 * clock adjustment can put endedAt before startedAt, and a negative minute
 * count renders as nonsense.
 */
const minutesBetween = (startedAt: string, endedAt: string): number =>
  Math.max(
    0,
    Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000,
    ),
  );

/**
 * The caller's own study totals.
 *
 * SELF ONLY, and deliberately not parameterised by user: GET /api/sessions is
 * listMine and takes its target from the access token. There is no per-user
 * sessions route, so a profile being read for someone else has no session
 * figures to show - the screen must hide them rather than show another
 * person's.
 *
 * Totals are derived here rather than requested because the API has no
 * aggregate route for them. That means the whole list crosses the wire to
 * produce two numbers; worth revisiting if a heavy account makes it slow, and
 * the fix would be a count endpoint rather than paging this.
 */
export const useStudySessions = (): StudySessionsState => {
  const [sessions, setSessions] = useState<RawSession[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await withAuth((token) =>
        request<RawSession[]>("/api/sessions", { token }),
      );
      setSessions(rows);
      setError(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your sessions.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo<StudyTotals | undefined>(() => {
    if (!sessions) return undefined;

    // One pass: a running session contributes to neither figure, so the filter
    // and the sum are the same walk.
    return sessions.reduce<StudyTotals>(
      (acc, session) =>
        session.endedAt
          ? {
              completed: acc.completed + 1,
              minutes: acc.minutes + minutesBetween(session.startedAt, session.endedAt),
            }
          : acc,
      { completed: 0, minutes: 0 },
    );
  }, [sessions]);

  return { totals, isLoading, error, reload: load };
};
