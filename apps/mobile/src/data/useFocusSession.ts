import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markGroupChanged } from "./groupSignal";
import { useMotionVariance } from "./useMotionVariance";
import {
  FOCUS_SAMPLE_INTERVAL_SEC,
  buildFocusTimeline,
  type FocusSpell,
  type FocusTimeline,
} from "./focusTrace";
import { usePhoneDown } from "./usePhoneDown";

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
const SAMPLE_INTERVAL_MS = FOCUS_SAMPLE_INTERVAL_SEC * 1000;

/**
 * How often the live reading and live chart are refreshed, counted in samples.
 * Every 30 seconds, so the chart visibly answers what the user is doing; it is
 * also refreshed straight away on returning to the app.
 */
const LIVE_REFRESH_EVERY = 2;

/**
 * Below this, a trip out of the app is not an interruption.
 *
 * iOS fires a state change for a notification banner, a control-centre pull and
 * the app switcher passing through. Logging each as a distraction would bury
 * the real ones and spend the write budget on noise.
 */
const MIN_AWAY_SEC = 5;

/**
 * The session this device is running, kept across app launches.
 *
 * Set when a session starts and cleared when it ends. Finding it set when no
 * session is running here means the app died - or a request to end failed -
 * mid-session, and that session is closed as ABANDONED (at its last sign of
 * life) before anything new starts. The server would otherwise see it as still
 * running for a few minutes and refuse the new one: one session per person.
 */
const RUNNING_KEY = "focus.runningSessionId";

/**
 * Waits between attempts to end a session through a bad connection - about
 * thirty seconds in all, enough to ride out a lift or a tunnel without leaving
 * the user staring at a spinner for minutes.
 */
const END_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** Worth retrying: no response at all, the server failing, or rate limiting. */
const isRetryable = (err: unknown) =>
  err instanceof ApiError && (err.status === 0 || err.status >= 500 || err.status === 429);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));


/** What PATCH /api/sessions/:id/end answers, which is the session row itself. */
interface EndedSession {
  id: string;
  focusPoints: number;
  focusScore: number | null;
  focusWeightedMinutes: number | null;
  completionFactor: number | null;
  hadWatch: boolean;
  tasksTotal: number | null;
  tasksCompleted: number | null;
}

/** What POST /api/sessions and POST /api/sessions/join answer. */
interface StartedSession {
  id: string;
  groupId: string | null;
  /** Set for group sessions - what someone else types to join this one. */
  inviteCode: string | null;
  plannedMinutes: number | null;
}

/** The group a session is (or will be) studied in. */
export interface SessionGroup {
  id: string;
  name: string;
}

interface SamplePage {
  data: { timestamp: string; computedFocus: number }[];
}

/** One item on the session checklist. */
export interface SessionTask {
  id: string;
  title: string;
  isComplete: boolean;
}

interface TaskList {
  data: SessionTask[];
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
    tasksTotal: number;
    tasksCompleted: number;
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
  tasksTotal: number;
  tasksCompleted: number;
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
  /** Seconds of absence credited as phone-down time rather than distraction. */
  phoneDownSec: number;
  /** Face-down mode is engaged: the study screen should go dark. */
  isPhoneDown: boolean;
  result: FocusResult | null;
  rating: number | null;
  /**
   * Per-sample scores in time order, 0-1, for the recap's trace. Empty until
   * the session ends - during one the dial already carries the average, and a
   * chart redrawing every 15 seconds is motion without information.
   */
  trace: FocusTimeline | null;
  /** The running session's chart so far; null until the first refresh. */
  liveTimeline: FocusTimeline | null;
  /** Seconds left against the plan, or null for an open-ended session. */
  remainingSec: number | null;
  /** False when motion is the fallback rather than a real accelerometer. */
  hasMotionSensor: boolean;
  /** Days in a row, for the recap's reward card. 0 until the streak loads. */
  streakDays: number;

  /**
   * The checklist.
   *
   * Before a session exists these are DRAFTS held on the client: tasks hang
   * off a session row, and there is no session to hang them off until Start is
   * pressed. start() posts them in one call, so planning never writes rows for
   * a session the user then abandons.
   */
  tasks: SessionTask[];
  draftTasks: string[];
  addDraftTask: (title: string) => void;
  removeDraftTask: (index: number) => void;
  /** Adds a task mid-session. A plan that cannot change is not how studying works. */
  addTask: (title: string) => void;
  toggleTask: (task: SessionTask) => void;
  removeTask: (taskId: string) => void;
  /**
   * The group the NEXT Start will study in, or null for solo. Chosen from a
   * group's screen; cleared after use so a later session is not silently a
   * group one.
   */
  selectedGroup: SessionGroup | null;
  setSelectedGroup: (group: SessionGroup | null) => void;
  /**
   * The running (or just-finished) session's group and invite code, for the
   * screen to show and share. Null for a solo session.
   */
  activeGroup: { name: string; inviteCode: string | null } | null;
  /** The running or just-finished session, so the recap can link a post to it. */
  sessionId: string | null;
  /**
   * Where ending stands. "retrying" while the server cannot be reached and the
   * end is being re-sent; "failed" once that has run out - the clock is
   * stopped, nothing is lost, and end() tries again or reset() leaves it to be
   * closed later (see RUNNING_KEY).
   */
  ending: "none" | "retrying" | "failed";
  /**
   * Set when a join was refused because the session's group is private and the
   * user is not in it - the group to send them to, to enter its join code.
   */
  privateGroupId: string | null;
  error?: string;
  busy: boolean;
  start: () => void;
  /**
   * Joins someone's running group session by its invite code. While a session
   * is running this refuses unless `switching` is set - then the current one
   * is ended (and saved) first. Confirm with the user before switching.
   */
  join: (inviteCode: string, groupName?: string, options?: { switching?: boolean }) => void;
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
  const [phoneDownSec, setPhoneDownSec] = useState(0);
  const [result, setResult] = useState<FocusResult | null>(null);
  const [trace, setTrace] = useState<FocusTimeline | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<FocusTimeline | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [tasks, setTasks] = useState<SessionTask[]>([]);
  const [draftTasks, setDraftTasks] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<SessionGroup | null>(null);
  const [activeGroup, setActiveGroup] =
    useState<FocusSessionState["activeGroup"]>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [privateGroupId, setPrivateGroupId] = useState<string | null>(null);
  const [ending, setEnding] = useState<FocusSessionState["ending"]>("none");
  /**
   * When End was FIRST tapped. Every retry sends this rather than its own
   * moment, so time spent waiting for a connection is not study time.
   */
  const endTappedAtRef = useRef<number | null>(null);

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
  /** Absences settled this session, so the chart can say what each gap was. */
  const awaySpellsRef = useRef<FocusSpell[]>([]);
  const downSpellsRef = useRef<FocusSpell[]>([]);
  /** Whether the current absence began straight after the phone lay face-down. */
  const leftFromPhoneDownRef = useRef(false);

  const stopTimers = useRef<() => void>(() => {});

  const { startMotion, stopMotion, readMotionVariance, hasSensor } = useMotionVariance();
  const { isPhoneDown, startPhoneDown, stopPhoneDown, wasPhoneDownRecently, stepsBetween } =
    usePhoneDown();

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
      // Away time counts, as it does in the final score: averaging only the
      // samples would show a full reading to someone who has been gone for
      // half the session.
      const timeline = buildFocusTimeline({
        samples: page.data,
        startedAtMs: startedAtRef.current,
        endedAtMs: Date.now(),
        awaySpells: awaySpellsRef.current,
        downSpells: downSpellsRef.current,
      });
      if (timeline.average === null) return;
      setLiveTimeline(timeline);
      setLiveFocus(timeline.average);
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
    awaySpellsRef.current.push({ endMs: Date.now(), durationSec });
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

  /**
   * Decides what an absence was, then records it.
   *
   * An absence that began straight after the phone lay face-down, with no
   * steps on the pedometer while away, is phone-down time - the phone locked
   * and left on the desk - and is NOT logged as an interruption, so the score
   * does not count it as time away. Anything else, including every absence
   * the pedometer cannot vouch for, is logged as before. See usePhoneDown for
   * why this is inferred rather than measured.
   */
  const settleAway = useCallback(
    async (sinceMs: number, untilMs: number, fromPhoneDown: boolean) => {
      const durationSec = (untilMs - sinceMs) / 1000;
      if (fromPhoneDown && (await stepsBetween(sinceMs, untilMs)) === 0) {
        setPhoneDownSec((prev) => prev + durationSec);
        downSpellsRef.current.push({ endMs: untilMs, durationSec });
      } else {
        await logAway(durationSec);
      }
      // Straight away, so the gap shows on the live chart the moment the user
      // is back rather than at the next scheduled refresh.
      if (sessionIdRef.current) void refreshLiveFocus(sessionIdRef.current);
    },
    [logAway, stepsBetween, refreshLiveFocus],
  );

  /** Ticking clock, sampler and AppState listener, all torn down together. */
  const startTimers = useCallback(() => {
    startMotion();
    startPhoneDown();

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
        if (since) void settleAway(since, Date.now(), leftFromPhoneDownRef.current);
      } else if (awaySinceRef.current === null) {
        awaySinceRef.current = Date.now();
        // Read at the moment of leaving: by the time the user is back, "was it
        // face-down just now" would be asking about the wrong moment.
        leftFromPhoneDownRef.current = wasPhoneDownRecently();
      }
    };
    const subscription = AppState.addEventListener("change", onAppState);

    stopTimers.current = () => {
      clearInterval(tick);
      clearInterval(sampler);
      subscription.remove();
      stopMotion();
      stopPhoneDown();
      stopTimers.current = () => {};
    };
  }, [sendSample, settleAway, startMotion, stopMotion, startPhoneDown, stopPhoneDown, wasPhoneDownRecently]);

  // Nothing may outlive the screen: an interval still posting samples after
  // the user has navigated away would keep writing to a session they think
  // they left.
  useEffect(() => () => stopTimers.current(), []);

  /**
   * Closes a session this device left running - see RUNNING_KEY. Shared and
   * awaited by start and join, and run once on mount so a crashed session is
   * closed promptly rather than when the user next studies.
   *
   * Never throws. A failure leaves the key in place for the next attempt, and
   * the server's own five-minute rule is the backstop either way.
   */
  const settlingRef = useRef<Promise<void> | null>(null);
  const settleLeftover = useCallback((): Promise<void> => {
    if (settlingRef.current) return settlingRef.current;

    settlingRef.current = (async () => {
      try {
        const leftover = await AsyncStorage.getItem(RUNNING_KEY);
        if (!leftover || leftover === sessionIdRef.current) return;
        try {
          await withAuth((token) =>
            request(`/api/sessions/${leftover}/abandon`, { method: "PATCH", token }),
          );
        } catch (err) {
          // Gone, or not ours (another account signed in here): nothing to
          // close, so forget it. Anything else is kept for a retry.
          if (!(err instanceof ApiError && (err.status === 404 || err.status === 403))) return;
        }
        await AsyncStorage.removeItem(RUNNING_KEY);
      } catch {
        /* storage unavailable - the server's rule covers it */
      } finally {
        settlingRef.current = null;
      }
    })();
    return settlingRef.current;
  }, []);

  useEffect(() => {
    void settleLeftover();
  }, [settleLeftover]);

  /** Forgets the running session once it has properly ended. */
  const clearRunning = () => {
    AsyncStorage.removeItem(RUNNING_KEY).catch(() => {});
  };

  /**
   * Everything after the session row exists, shared by start and join: attach
   * the checklist, reset the counters, start the clock.
   */
  const begin = useCallback(
    async (session: StartedSession, groupName: string | null) => {
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      AsyncStorage.setItem(RUNNING_KEY, session.id).catch(() => {});
      setActiveGroup(
        session.groupId && groupName
          ? { name: groupName, inviteCode: session.inviteCode }
          : null,
      );

      // Drafts become real rows now there is a session to attach them to.
      // Failure here is not fatal: the session has started, and losing the
      // checklist is better than losing the session over it.
      if (draftTasks.length > 0) {
        try {
          const created = await withAuth((token) =>
            request<TaskList>(`/api/sessions/${session.id}/tasks`, {
              method: "POST",
              token,
              body: { titles: draftTasks },
            }),
          );
          setTasks(created.data);
        } catch (err) {
          if (__DEV__) console.warn("[focus] checklist not saved:", describe(err));
        }
      } else {
        setTasks([]);
      }

      startedAtRef.current = Date.now();
      sampleCountRef.current = 0;
      awaySinceRef.current = null;

      setSampleCount(0);
      setElapsedSec(0);
      setAwaySec(0);
      setPhoneDownSec(0);
      setLiveFocus(null);
      setResult(null);
      setRating(null);
      setTrace(null);
      setLiveTimeline(null);
      awaySpellsRef.current = [];
      downSpellsRef.current = [];
      setPhase("running");
      startTimers();
    },
    [draftTasks, startTimers],
  );

  const start = useCallback(() => {
    if (busy || phase === "running") return;
    setBusy(true);
    setError(undefined);

    const group = selectedGroup;

    void (async () => {
      try {
        await settleLeftover();
        const session = await withAuth((token) =>
          request<StartedSession>("/api/sessions", {
            method: "POST",
            token,
            // plannedMinutes is an Int column, so a 17m30s plan is stored as
            // 18. The countdown on screen still uses the exact seconds chosen.
            body: {
              ...(plannedSec
                ? { plannedMinutes: Math.max(1, Math.round(plannedSec / 60)) }
                : {}),
              ...(group ? { groupId: group.id } : {}),
            },
          }),
        );

        // Used up: the next session is solo unless a group is chosen again.
        setSelectedGroup(null);
        await begin(session, group?.name ?? null);
      } catch (err) {
        setError(describe(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, phase, plannedSec, selectedGroup, begin, settleLeftover]);

  const join = useCallback(
    (inviteCode: string, groupName?: string, options?: { switching?: boolean }) => {
      const code = inviteCode.trim();
      if (busy || !code) return;
      const switching = phase === "running";
      if (switching && !options?.switching) {
        setError("End your current session before joining another.");
        return;
      }
      setBusy(true);
      setError(undefined);
      setPrivateGroupId(null);

      void (async () => {
        try {
          if (switching) {
            // End the current session first - saved, just without a recap - so
            // the server's one-session rule sees nothing still running.
            const current = sessionIdRef.current;
            stopTimers.current();
            const since = awaySinceRef.current;
            awaySinceRef.current = null;
            if (since) await logAway((Date.now() - since) / 1000);
            if (current) {
              try {
                await withAuth((token) =>
                  request(`/api/sessions/${current}/end`, { method: "PATCH", token }),
                );
                clearRunning();
              } catch (err) {
                // Its clock has stopped either way. The kept RUNNING_KEY lets
                // settleLeftover close it properly on the next try.
                sessionIdRef.current = null;
                setPhase("idle");
                throw err;
              }
            }
            sessionIdRef.current = null;
          }

          await settleLeftover();
          const session = await withAuth((token) =>
            request<StartedSession>("/api/sessions/join", {
              method: "POST",
              token,
              body: { inviteCode: code },
            }),
          );

          // The host's remaining time, so the room finishes together. The
          // server rounds up to whole minutes; an open-ended host gives an
          // open-ended session.
          setPlannedSec((session.plannedMinutes ?? 0) * 60);
          setSelectedGroup(null);
          // Joining a public group's session joins the group too, which the
          // Groups view's lists should reflect.
          if (session.groupId) markGroupChanged(session.groupId);
          await begin(session, groupName ?? "Group session");
        } catch (err) {
          setError(describe(err));
          // A public group is joined on the way in; only a private one refuses,
          // and it says which group so the screen can offer to open it.
          if (
            err instanceof ApiError &&
            err.status === 403 &&
            typeof err.data.groupId === "string"
          ) {
            setPrivateGroupId(err.data.groupId);
          }
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, phase, begin, logAway, settleLeftover],
  );

  /**
   * Sends the end, retrying through a bad connection.
   *
   * A 409 means it has ALREADY ended - most likely an earlier attempt that
   * reached the server but whose answer was lost - so the row is read back and
   * treated as this attempt's answer rather than as a failure.
   */
  const requestEnd = useCallback(async (sessionId: string, endedAt: string) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await withAuth((token) =>
          request<EndedSession>(`/api/sessions/${sessionId}/end`, {
            method: "PATCH",
            token,
            body: { endedAt },
          }),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return withAuth((token) =>
            request<EndedSession>(`/api/sessions/${sessionId}`, { token }),
          );
        }
        if (!isRetryable(err) || attempt >= END_RETRY_DELAYS_MS.length) throw err;
        setEnding("retrying");
        await sleep(END_RETRY_DELAYS_MS[attempt]);
      }
    }
  }, []);

  const end = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (busy || !sessionId) return;
    setBusy(true);
    setError(undefined);

    // Only the first tap counts - "Try again" after a failure keeps it.
    const firstTap = endTappedAtRef.current === null;
    if (firstTap) endTappedAtRef.current = Date.now();
    const tappedAt = endTappedAtRef.current!;

    void (async () => {
      if (firstTap) {
        // Stopped FIRST: a sample landing after the session has ended is
        // rejected by the API, and the score is computed on end from what is
        // already stored.
        stopTimers.current();

        // A session ended while the user is still away should count that time.
        const since = awaySinceRef.current;
        awaySinceRef.current = null;
        if (since) await logAway((tappedAt - since) / 1000);
      }

      try {
        const ended = await requestEnd(sessionId, new Date(tappedAt).toISOString());
        setEnding("none");

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
          tasksTotal: ended.tasksTotal ?? summary?.tasksTotal ?? 0,
          tasksCompleted: ended.tasksCompleted ?? summary?.tasksCompleted ?? 0,
          totalSec: startedAtRef.current
            ? Math.round((tappedAt - startedAtRef.current) / 1000)
            : 0,
        });

        try {
          const page = await withAuth((token) =>
            request<SamplePage>(
              `/api/sessions/${sessionId}/focus-samples?limit=500`,
              { token },
            ),
          );
          setTrace(
            buildFocusTimeline({
              samples: page.data,
              startedAtMs: startedAtRef.current,
              endedAtMs: Date.now(),
              awaySpells: awaySpellsRef.current,
              downSpells: downSpellsRef.current,
            }),
          );
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

        clearRunning();
        endTappedAtRef.current = null;
        setPhase("recap");
      } catch (err) {
        // The clock is stopped and nothing is lost. The screen offers to try
        // again (end() again, same tap time) or to leave it: reset() then
        // drops the session here, and the kept RUNNING_KEY has the next start,
        // join or launch close it properly at its last sign of life.
        setEnding("failed");
        setError(
          isRetryable(err)
            ? "Couldn't reach the server to end your session. Your time is safe - try again, or leave it and it will be saved next time you study."
            : describe(err),
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, logAway, requestEnd]);

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

  // ---- checklist ----------------------------------------------------------

  const addDraftTask = useCallback((title: string) => {
    const clean = title.trim();
    if (clean) setDraftTasks((prev) => [...prev, clean]);
  }, []);

  const removeDraftTask = useCallback((index: number) => {
    setDraftTasks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Every checklist write answers with the WHOLE list, so the server's order
   * and ids are the ones held here - no merging two shapes, and no local list
   * drifting from the one being scored.
   */
  const mutateTasks = useCallback(
    (path: string, method: string, body?: unknown) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;

      void (async () => {
        try {
          const res = await withAuth((token) =>
            request<TaskList>(`/api/sessions/${sessionId}${path}`, {
              method,
              token,
              body,
            }),
          );
          setTasks(res.data);
        } catch (err) {
          setError(describe(err));
        }
      })();
    },
    [],
  );

  const addTask = useCallback(
    (title: string) => {
      const clean = title.trim();
      if (clean) mutateTasks("/tasks", "POST", { titles: [clean] });
    },
    [mutateTasks],
  );

  const toggleTask = useCallback(
    (task: SessionTask) => {
      // Applied locally first: ticking a box is one tap and the request is a
      // detail. The server's answer replaces this a moment later either way.
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, isComplete: !t.isComplete } : t)),
      );
      mutateTasks(`/tasks/${task.id}`, "PATCH", { isComplete: !task.isComplete });
    },
    [mutateTasks],
  );

  const removeTask = useCallback(
    (taskId: string) => mutateTasks(`/tasks/${taskId}`, "DELETE"),
    [mutateTasks],
  );

  const reset = useCallback(() => {
    stopTimers.current();
    sessionIdRef.current = null;
    endTappedAtRef.current = null;
    setEnding("none");
    setSessionId(null);
    setActiveGroup(null);
    setPrivateGroupId(null);
    startedAtRef.current = null;
    sampleCountRef.current = 0;
    awaySinceRef.current = null;
    setPhase("idle");
    setElapsedSec(0);
    setSampleCount(0);
    setLiveFocus(null);
    setAwaySec(0);
    setPhoneDownSec(0);
    setResult(null);
    setRating(null);
    setTrace(null);
    setLiveTimeline(null);
    awaySpellsRef.current = [];
    downSpellsRef.current = [];
    setTasks([]);
    // Drafts survive a reset on purpose: someone who studies the same list
    // twice should not have to retype it.
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
    liveTimeline,
    remainingSec,
    streakDays,
    tasks,
    draftTasks,
    addDraftTask,
    removeDraftTask,
    addTask,
    toggleTask,
    removeTask,
    hasMotionSensor: hasSensor(),
    plannedSec,
    setPlannedSec,
    sampleCount,
    liveFocus,
    awaySec,
    phoneDownSec,
    isPhoneDown,
    result,
    rating,
    selectedGroup,
    setSelectedGroup,
    activeGroup,
    sessionId,
    ending,
    privateGroupId,
    error,
    busy,
    start,
    join,
    end,
    rate,
    reset,
  };
};
