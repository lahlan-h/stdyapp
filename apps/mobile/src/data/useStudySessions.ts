import { useCallback, useEffect, useMemo, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { studiedMinutes } from "./sessionTime";

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
  /** Credited break seconds, left out of every duration - see sessionTime.ts. */
  pausedSeconds?: number;
  focusPoints: number;
  /** Null when the session was never scored - not the same as a score of 0. */
  focusScore: number | null;
  /** Null for a solo session, or one whose group has since been deleted. */
  group: { id: string; name: string } | null;
}

/** One finished session, as a history row or a post's link picker shows it. */
export interface PastSession {
  id: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  focusPoints: number;
  focusScore: number | null;
  groupName: string | null;
}

export interface StudyTotals {
  /** Sessions that have ended. A running one is not yet a session studied. */
  completed: number;
  /** Summed minutes across completed sessions. */
  minutes: number;
}

export interface StudySessionsState {
  totals?: StudyTotals;
  /** Finished sessions, newest first. A running one is not history yet. */
  sessions?: PastSession[];
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * Studied minutes, breaks left out and floored at zero, matching how the API
 * derives every session duration - see sessionTime.ts.
 */
const minutesOf = (session: RawSession): number => studiedMinutes(session);

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
              minutes: acc.minutes + minutesOf(session),
            }
          : acc,
      { completed: 0, minutes: 0 },
    );
  }, [sessions]);

  const past = useMemo<PastSession[] | undefined>(
    () =>
      sessions
        ?.filter((session): session is RawSession & { endedAt: string } =>
          Boolean(session.endedAt),
        )
        .map((session) => ({
          id: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          minutes: minutesOf(session),
          focusPoints: session.focusPoints,
          focusScore: session.focusScore,
          groupName: session.group?.name ?? null,
        })),
    [sessions],
  );

  return { totals, sessions: past, isLoading, error, reload: load };
};
