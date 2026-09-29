import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { useMotionVariance } from "./useMotionVariance";

/**
 * Drives one focus session: start, stream samples, log time away, end, rate.
 *
 * The seam rule from src/data/index.ts applies as it does everywhere else -
 * nothing in app/ knows a URL, a status code or the API's response shapes.
 *
 * WHAT THIS PRODUCES IS AN ESTIMATE. A personally-calibrated guess at how
 * focused a session was, from a phone's sensors. Never a medical or clinical
 * measurement of attention, and the screen must not present it as one.
 */

/**
 * How often a sample is sent.
 *
 * 15s rather than something finer because each one is a row in the
 * fastest-growing table in the database: an hour of study is 240 rows at this
 * rate and 3,600 at one per second, for an estimate that cannot be that
 * precise anyway.
 */
const SAMPLE_INTERVAL_MS = 15_000;

/** How often the live reading is refreshed, counted in samples. */
const LIVE_REFRESH_EVERY = 4;

/**
 * Below this, a trip out of the app is not an interruption.
 *
 * iOS fires a state change for a notification banner, a control-centre pull and
 * the app switcher passing through. Logging each as a distraction would bury
 * the real ones and spend the write budget on noise.
 */
const MIN_AWAY_SEC = 5;


/** What PATCH /api/sessions/:id/end answers, which is the session row itself. */
interface EndedSession {
  id: string;
  focusPoints: number;
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  completionFactor: number | null;
  hadWatch: boolean;
}

interface StartedSession {
  id: string;
}

interface SamplePage {
  data: { computedFocus: number }[];
}

/** What GET /api/streaks/me answers - a bare row, not wrapped in `data`. */
interface StreakRow {
  currentCount: number;
}

/** What GET /api/sessions/:id/focus answers once the session has ended. */
interface FocusSummary {
  data: {
    awaySeconds: number;
    interruptionCount: number;
    sampleCount: number;
    selfRating: number | null;
  };
}

/**
 * Three steps. The self-rating is NOT one of them: it is a sheet over the
 * recap, so the recap stays visible behind it and answering feels like part of
 * finishing rather than a second task.
 */
export type FocusPhase = "idle" | "running" | "recap";

export interface FocusResult {
  /** 0-100, or null when the session produced no samples to score. */
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  completionFactor: number | null;
  /** The other feature's gamification number, shown beside ours, never merged. */
  focusPoints: number;
  hadWatch: boolean;
  awaySeconds: number;
  interruptionCount: number;
  /** How long the session actually ran, for the recap's total-time row. */
  totalSec: number;
}

export interface FocusSessionState {
  phase: FocusPhase;
  elapsedSec: number;
  /**
   * The chosen length in SECONDS, which is what the picker produces and what
   * the countdown shows. 0 means open-ended.
   *
   * Seconds rather than minutes because the wheel offers them and a countdown
   * that rounded the user's own choice would be visibly wrong. The API column
   * is whole minutes, so the request rounds - see start().
   */
  plannedSec: number;
  setPlannedSec: (seconds: number) => void;
  sampleCount: number;
  /** Running average of the server's per-sample scores, 0-100. */
  liveFocus: number | null;
  awaySec: number;
  result: FocusResult | null;
  rating: number | null;
  /**
   * Per-sample scores in time order, 0-1, for the recap's trace. Empty until
   * the session ends - during one the dial already carries the average, and a
   * chart redrawing every 15 seconds is motion without information.
   */
  trace: number[];
  /** Seconds left against the plan, or null for an open-ended session. */
  remainingSec: number | null;
  /** False when motion is the fallback rather than a real accelerometer. */
  hasMotionSensor: boolean;
  /** Days in a row, for the recap's reward card. 0 until the streak loads. */
  streakDays: number;
  error?: string;
  busy: boolean;
  start: () => void;
  end: () => void;
  rate: (value: number) => void;
  reset: () => void;
}

export const useFocusSession = (): FocusSessionState => {
  const [phase, setPhase] = useState<FocusPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [plannedSec, setPlannedSec] = useState(25 * 60);
  const [sampleCount, setSampleCount] = useState(0);
  const [liveFocus, setLiveFocus] = useState<number | null>(null);
  const [awaySec, setAwaySec] = useState(0);
  const [result, setResult] = useState<FocusResult | null>(null);
  const [trace, setTrace] = useState<number[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /**
   * Refs, not state, for everything the interval and the AppState listener
   * touch. Both are set up once when the session starts, so a state value read
   * inside either would be the one captured at that moment and never change -
   * the sampler would post to the first session id forever.
   */
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const sampleCountRef = useRef(0);
  const awaySinceRef = useRef<number | null>(null);

  const stopTimers = useRef<() => void>(() => {});

  const { startMotion, stopMotion, readMotionVariance, hasSensor } = useMotionVariance();

  const describe = (err: unknown) =>
    err instanceof ApiError ? err.message : "Something went wrong";

  /** Refreshes the live reading from the scores the SERVER computed. */
  const refreshLiveFocus = useCallback(async (sessionId: string) => {
    try {
      const page = await withAuth((token) =>
        request<SamplePage>(`/api/sessions/${sessionId}/focus-samples?limit=500`, {
          token,
        }),
      );
      const scores = page.data.map((s) => s.computedFocus);
      if (scores.length === 0) return;
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      setLiveFocus(Math.round(mean * 100));
    } catch {
      // A failed read leaves the last reading on screen. It is a progress
      // indicator, not the result, and the session must not end over it.
    }
  }, []);

  const sendSample = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    // AppState is the only presence signal available: a suspended app cannot
    // report anything, so "not active" is as close as this gets in-band. The
    // real absence is caught by the interruption logged on return.
    const inApp = AppState.currentState === "active";
    // Reads and RESETS the window, so each sample describes only the interval
    // since the last one.
    const motionVariance = readMotionVariance();

    try {
      await withAuth((token) =>
        request(`/api/sessions/${sessionId}/focus-samples`, {
          method: "POST",
          token,
          body: { samples: [{ motionVariance, inApp }] },
        }),
      );

      sampleCountRef.current += 1;
      setSampleCount(sampleCountRef.current);

      if (sampleCountRef.current % LIVE_REFRESH_EVERY === 0) {
        void refreshLiveFocus(sessionId);
      }
    } catch (err) {
      // Deliberately not surfaced and not fatal. A dropped sample costs a
      // little precision; tearing the session down over one would lose the
      // whole thing, and the phone is the least reliable part of this path.
      if (__DEV__) console.warn("[focus] sample dropped:", describe(err));
    }
  }, [refreshLiveFocus, readMotionVariance]);

  /**
   * Records a trip out of the app as an interruption.
   *
   * This is the ONLY way the estimate learns about absence. iOS suspends a
   * backgrounded app, so no sample saying "gone" is ever sent - there is just a
   * gap, and this is what turns the gap into data. Without it a user who spent
   * half a session elsewhere scores as if they never left.
   */
  const logAway = useCallback(async (durationSec: number) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || durationSec < MIN_AWAY_SEC) return;

    setAwaySec((prev) => prev + durationSec);
    try {
      await withAuth((token) =>
        request(`/api/sessions/${sessionId}/interruptions`, {
          method: "POST",
          token,
          body: { durationSec: Math.round(durationSec), type: "APP_EXIT" },
        }),
      );
    } catch (err) {
      if (__DEV__) console.warn("[focus] interruption not logged:", describe(err));
    }
  }, []);

  /** Ticking clock, sampler and AppState listener, all torn down together. */
  const startTimers = useCallback(() => {
    startMotion();

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    const sampler = setInterval(() => void sendSample(), SAMPLE_INTERVAL_MS);
    void sendSample();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") {
        const since = awaySinceRef.current;
        awaySinceRef.current = null;
        if (since) void logAway((Date.now() - since) / 1000);
      } else if (awaySinceRef.current === null) {
        awaySinceRef.current = Date.now();
      }
    };
    const subscription = AppState.addEventListener("change", onAppState);

    stopTimers.current = () => {
      clearInterval(tick);
      clearInterval(sampler);
      subscription.remove();
      stopMotion();
      stopTimers.current = () => {};
    };
  }, [sendSample, logAway, startMotion, stopMotion]);

  // Nothing may outlive the screen: an interval still posting samples after
  // the user has navigated away would keep writing to a session they think
  // they left.
  useEffect(() => () => stopTimers.current(), []);

  const start = useCallback(() => {
    if (busy || phase === "running") return;
    setBusy(true);
    setError(undefined);

    void (async () => {
      try {
        const session = await withAuth((token) =>
          request<StartedSession>("/api/sessions", {
            method: "POST",
            token,
            // plannedMinutes is an Int column, so a 17m30s plan is stored as
            // 18. The countdown on screen still uses the exact seconds chosen.
            body: plannedSec
              ? { plannedMinutes: Math.max(1, Math.round(plannedSec / 60)) }
              : {},
          }),
        );

        sessionIdRef.current = session.id;
        startedAtRef.current = Date.now();
        sampleCountRef.current = 0;
        awaySinceRef.current = null;

        setSampleCount(0);
        setElapsedSec(0);
        setAwaySec(0);
        setLiveFocus(null);
        setResult(null);
        setRating(null);
        setTrace([]);
        setPhase("running");
        startTimers();
      } catch (err) {
        setError(describe(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, phase, plannedSec, startTimers]);

  const end = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (busy || !sessionId) return;
    setBusy(true);

    void (async () => {
      // Stopped FIRST: a sample landing after the session has ended is
      // rejected by the API, and the score is computed on end from what is
      // already stored.
      stopTimers.current();

      // A session ended while the user is still away should count that time.
      const since = awaySinceRef.current;
      awaySinceRef.current = null;
      if (since) await logAway((Date.now() - since) / 1000);

      try {
        const ended = await withAuth((token) =>
          request<EndedSession>(`/api/sessions/${sessionId}/end`, {
            method: "PATCH",
            token,
          }),
        );

        // The end response carries the score but not the away time or the
        // interruption count the recap shows, so the authoritative summary is
        // read back in one call rather than assembled from two shapes.
        let summary: FocusSummary["data"] | null = null;
        try {
          summary = (
            await withAuth((token) =>
              request<FocusSummary>(`/api/sessions/${sessionId}/focus`, { token }),
            )
          ).data;
        } catch {
          /* the score alone is still enough to show a recap */
        }

        setResult({
          focusScore: ended.focusScore,
          focusWeightedMinutes: ended.focusWeightedMinutes,
          completionFactor: ended.completionFactor,
          focusPoints: ended.focusPoints,
          hadWatch: ended.hadWatch,
          awaySeconds: summary?.awaySeconds ?? 0,
          interruptionCount: summary?.interruptionCount ?? 0,
          totalSec: startedAtRef.current
            ? Math.round((Date.now() - startedAtRef.current) / 1000)
            : 0,
        });

        try {
          const page = await withAuth((token) =>
            request<SamplePage>(
              `/api/sessions/${sessionId}/focus-samples?limit=500`,
              { token },
            ),
          );
          setTrace(page.data.map((sample) => sample.computedFocus));
        } catch {
          /* no trace: the recap simply omits the chart */
        }

        // Read AFTER the session ends, because ending it is what extends the
        // streak - fetching earlier would show yesterday's number.
        try {
          const streak = await withAuth((token) =>
            request<StreakRow>("/api/streaks/me", { token }),
          );
          setStreakDays(streak.currentCount ?? 0);
        } catch {
          /* the reward card falls back to hiding the streak */
        }

        setPhase("recap");
      } catch (err) {
        setError(describe(err));
        // Back to idle rather than stuck mid-session: the timers are already
        // gone, so "running" would be a lie the user could not get out of.
        setPhase("idle");
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, logAway]);

  const rate = useCallback(
    (value: number) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      // Applied locally first: the rating is one tap and the request is a
      // detail. A failure rolls it back and says so.
      const previous = rating;
      setRating(value);

      void (async () => {
        try {
          await withAuth((token) =>
            request(`/api/sessions/${sessionId}/focus-rating`, {
              method: "PUT",
              token,
              body: { selfRating: value },
            }),
          );
        } catch (err) {
          setRating(previous);
          setError(describe(err));
        }
      })();
    },
    [rating],
  );

  const reset = useCallback(() => {
    stopTimers.current();
    sessionIdRef.current = null;
    startedAtRef.current = null;
    sampleCountRef.current = 0;
    awaySinceRef.current = null;
    setPhase("idle");
    setElapsedSec(0);
    setSampleCount(0);
    setLiveFocus(null);
    setAwaySec(0);
    setResult(null);
    setRating(null);
    setTrace([]);
    setError(undefined);
  }, []);

  /**
   * Counts DOWN against a plan and up without one, matching what the dial
   * shows. Floored at zero rather than going negative: running over a plan is
   * allowed, and "-04:12" reads as a fault.
   */
  const remainingSec = plannedSec === 0 ? null : Math.max(0, plannedSec - elapsedSec);

  return {
    phase,
    elapsedSec,
    trace,
    remainingSec,
    streakDays,
    hasMotionSensor: hasSensor(),
    plannedSec,
    setPlannedSec,
    sampleCount,
    liveFocus,
    awaySec,
    result,
    rating,
    error,
    busy,
    start,
    end,
    rate,
    reset,
  };
};
