import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { buildFocusTimeline, interruptionsToSpells, type FocusTimeline } from "./focusTrace";
import { describeLoadError, type SessionStatus } from "./useSessionHistory";
import { studiedSeconds } from "./sessionTime";

/** What GET /api/sessions/:id answers - the bare row, interruptions included. */
interface RawSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  groupId: string | null;
  focusPoints: number;
  /** Credited break seconds - absent from an API that predates breaks. */
  pausedSeconds?: number;
  pauseCount?: number;
  /** Trips away and breaks alike; `type` tells them apart. */
  interruptions?: { startedAt: string; durationSec: number; type?: string | null }[];
}

/** What GET /api/sessions/:id/focus answers, the fields read here. */
interface FocusSummary {
  data: {
    focusScore: number | null;
    focusWeightedMinutes: number | null;
    completionFactor: number | null;
    hadWatch: boolean;
    focusPoints: number;
    sampleCount: number;
    awaySeconds: number;
    interruptionCount: number;
    tasksTotal: number;
    tasksCompleted: number;
    selfRating: number | null;
  };
}

interface SamplePage {
  data: { timestamp: string; computedFocus: number }[];
}

/**
 * Same cutoff as ABANDONED_AFTER_MS in apps/api/src/services/sessionHistory.js.
 * The single-session route does not send a status, so it is re-derived here
 * the same way.
 */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/** One past session, with everything the recap-style detail view shows. */
export interface SessionDetail {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  /** Seconds STUDIED, breaks left out - the total-time card. 0 with no end. */
  totalSec: number;
  /** Breaks taken, and their credited seconds. */
  breakCount: number;
  breakSec: number;
  isGroup: boolean;
  /** The 0-100 focus ESTIMATE, or null when there is none. Never 0 for "none". */
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  completionFactor: number | null;
  /** The gamification number, shown beside the estimate, never merged with it. */
  focusPoints: number;
  hadWatch: boolean;
  awaySeconds: number;
  interruptionCount: number;
  tasksTotal: number;
  tasksCompleted: number;
  selfRating: number | null;
  /** The session against the clock; null when it produced no samples. */
  trace: FocusTimeline | null;
}

export interface SessionDetailState {
  session?: SessionDetail;
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
}

/**
 * One of the caller's sessions, for the history's detail view.
 *
 * The same three reads the Study tab makes once a session ends - the row, its
 * focus summary, and its samples for the trace - so the detail view can show
 * exactly what the recap showed. The trace is best-effort, as it is there: a
 * failed samples read leaves the chart out rather than failing the screen.
 */
export const useSessionDetail = (id: string | undefined): SessionDetailState => {
  const [session, setSession] = useState<SessionDetail | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const requestId = ++latest.current;
    setIsLoading(true);

    try {
      const [row, focus, trace] = await Promise.all([
        withAuth((token) => request<RawSession>(`/api/sessions/${id}`, { token })),
        withAuth((token) =>
          request<FocusSummary>(`/api/sessions/${id}/focus`, { token }),
        ),
        withAuth((token) =>
          request<SamplePage>(`/api/sessions/${id}/focus-samples?limit=500`, { token }),
        )
          .then((page) => page.data)
          .catch(() => [] as SamplePage["data"]),
      ]);
      if (requestId !== latest.current) return;

      const startedAt = new Date(row.startedAt);
      const endedAt = row.endedAt ? new Date(row.endedAt) : null;
      const status: SessionStatus = endedAt
        ? "ended"
        : Date.now() - startedAt.getTime() >= ABANDONED_AFTER_MS
          ? "abandoned"
          : "active";
      const f = focus.data;

      setSession({
        id: row.id,
        startedAt,
        endedAt,
        status,
        totalSec: studiedSeconds(row),
        breakCount: row.pauseCount ?? 0,
        breakSec: row.pausedSeconds ?? 0,
        isGroup: row.groupId !== null,
        focusScore: f.focusScore,
        focusWeightedMinutes: f.focusWeightedMinutes,
        completionFactor: f.completionFactor,
        focusPoints: f.focusPoints,
        hadWatch: f.hadWatch,
        awaySeconds: f.awaySeconds,
        interruptionCount: f.interruptionCount,
        tasksTotal: f.tasksTotal,
        tasksCompleted: f.tasksCompleted,
        selfRating: f.selfRating,
        // Read back from the server, which records trips away but never
        // phone-down time - so an unexplained gap here was the phone down.
        trace:
          trace.length > 0
            ? buildFocusTimeline({
                samples: trace,
                startedAtMs: startedAt.getTime(),
                endedAtMs: endedAt ? endedAt.getTime() : Date.now(),
                awaySpells: interruptionsToSpells(row.interruptions ?? [], "away"),
                // Recorded by the server as BREAK interruptions, so a break
                // shows as one rather than as an unexplained gap.
                breakSpells: interruptionsToSpells(row.interruptions ?? [], "break"),
                unmatchedGap: "down",
              })
            : null,
      });
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describeLoadError(err, "Could not load this session."));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { session, isLoading, loadError, reload: load };
};
