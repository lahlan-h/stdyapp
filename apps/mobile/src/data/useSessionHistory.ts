import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

/**
 * "ended" is a finished session. "active" is still running. "abandoned" is a
 * session left open past the API's cutoff - the app was killed before it could
 * end it - and has no duration or estimate to show.
 */
export type SessionStatus = "ended" | "active" | "abandoned";

/**
 * One row of GET /api/sessions, as the history screen reads it.
 *
 * Structural, like RawSession in useStudySessions: only the columns read here
 * are listed. The summary fields (status onwards) are the ones the API adds
 * for this screen - see apps/api/src/services/sessionHistory.js.
 */
interface RawHistoryRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  groupId: string | null;
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  tasksTotal: number | null;
  tasksCompleted: number | null;
  status: SessionStatus;
  durationMinutes: number | null;
  interruptionCount: number;
  awaySeconds: number;
  selfRating: number | null;
  isGroup: boolean;
}

/** A past session, ready to render. */
export interface SessionHistoryItem {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  /** Null while there is no end. Not 0 - that would read as a session that lasted no time. */
  durationMinutes: number | null;
  /** The 0-100 focus ESTIMATE, or null when the session was never scored. Never 0 for "none". */
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  /** Both 0 when the session had no checklist. */
  tasksTotal: number;
  tasksCompleted: number;
  interruptionCount: number;
  awaySeconds: number;
  /** 1-5, or null when the user did not rate it. */
  selfRating: number | null;
  isGroup: boolean;
}

export interface SessionHistoryState {
  /** Newest first. Undefined until the first load lands. */
  sessions?: SessionHistoryItem[];
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
}

const toItem = (row: RawHistoryRow): SessionHistoryItem => ({
  id: row.id,
  startedAt: new Date(row.startedAt),
  endedAt: row.endedAt ? new Date(row.endedAt) : null,
  status: row.status,
  durationMinutes: row.durationMinutes,
  focusScore: row.focusScore,
  focusWeightedMinutes: row.focusWeightedMinutes,
  tasksTotal: row.tasksTotal ?? 0,
  tasksCompleted: row.tasksCompleted ?? 0,
  interruptionCount: row.interruptionCount,
  awaySeconds: row.awaySeconds,
  selfRating: row.selfRating,
  isGroup: row.isGroup,
});

/**
 * The caller's study history, newest first.
 *
 * SELF ONLY, for useStudySessions' reason: GET /api/sessions is listMine. It
 * reads the same route as that hook and is kept separate rather than widening
 * it, because the profile only wants two totals and should not have to carry
 * every row's summary to get them.
 *
 * Unpaginated, because the route is: it returns the whole history. A session
 * is a person sitting down to study, so even a heavy term is a few hundred
 * rows.
 */
export const useSessionHistory = (): SessionHistoryState => {
  const [sessions, setSessions] = useState<SessionHistoryItem[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  // A pull-to-refresh racing the first load must not let the older answer win.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latest.current;
    setIsLoading(true);
    try {
      const rows = await withAuth((token) =>
        request<RawHistoryRow[]>("/api/sessions", { token }),
      );
      if (requestId !== latest.current) return;
      setSessions(rows.map(toItem));
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describeLoadError(err, "Could not load your sessions."));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { sessions, isLoading, loadError, reload: load };
};

/** Shared with useSessionDetail: a 429 deserves words, anything else the API's own. */
export const describeLoadError = (err: unknown, fallback: string): string => {
  if (!(err instanceof ApiError)) return fallback;
  if (err.status === 429) {
    return err.retryAfter
      ? `Too many refreshes. Try again in ${err.retryAfter}s.`
      : "Too many refreshes. Try again shortly.";
  }
  return err.message;
};
