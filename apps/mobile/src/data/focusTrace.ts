/**
 * A session laid out against the clock: what each 15 seconds of it was.
 *
 * WHY THIS EXISTS. iOS suspends the app the moment the user leaves it, so no
 * sample is sent while they are in another app - not a "gone" sample, nothing.
 * Plotting the samples alone drew a session with two Instagram breaks as a wall
 * of green: the breaks simply were not there. The score already counts away
 * time as zero focus (computeAwayFraction on the server); this makes the chart
 * and the live reading show it, and say what it was.
 *
 * Every interval becomes one of three things:
 *  - "focus": a sample was taken; its value is the server's per-sample score.
 *  - "away": no sample, and the time falls inside a logged trip out of the app.
 *  - "down": no sample, and the time was phone-down - the phone locked and left
 *    on the desk (see usePhoneDown). Not counted against the user.
 */

/** The cadence useFocusSession samples at. */
export const FOCUS_SAMPLE_INTERVAL_SEC = 15;

/**
 * A gap longer than this many intervals is an absence, not a late sample.
 *
 * Well above 1: a sample delivered late by a slow request - 8 seconds has been
 * seen on a real session - is not an absence and must not paint a block.
 */
const GAP_TOLERANCE = 1.8;

export type TraceSegment =
  | { kind: "focus"; value: number }
  | { kind: "away" }
  | { kind: "down" };

export interface FocusTimeline {
  segments: TraceSegment[];
  /**
   * 0-100, or null with nothing to average. Away intervals count as zero and
   * phone-down ones are left out - the same treatment the score gives them.
   */
  average: number | null;
  totalSec: number;
  awaySec: number;
  downSec: number;
  /** Trips out of the app, for "2 trips away". */
  awayCount: number;
}

export interface TimedFocusSample {
  timestamp: string | number | Date;
  computedFocus: number;
}

/** A stretch of time, identified by when it ended - which is when it is learned of. */
export interface FocusSpell {
  endMs: number;
  durationSec: number;
}

interface TimelineInput {
  samples: TimedFocusSample[];
  startedAtMs: number | null;
  /** When the session ended, or now for a running one. */
  endedAtMs: number;
  awaySpells?: FocusSpell[];
  downSpells?: FocusSpell[];
  /**
   * What a gap matching no spell was. A running session knows every spell it
   * settled, so an unmatched gap there is an absence too short to log, which
   * is shown as away. A finished session read back from the server knows only
   * the logged trips - phone-down time is deliberately never logged - so an
   * unmatched gap there was phone-down.
   */
  unmatchedGap?: "away" | "down";
  intervalSec?: number;
}

const covers = (spells: FocusSpell[], atMs: number, slackMs: number) =>
  spells.some(
    (s) => atMs >= s.endMs - s.durationSec * 1000 - slackMs && atMs <= s.endMs + slackMs,
  );

export const buildFocusTimeline = ({
  samples,
  startedAtMs,
  endedAtMs,
  awaySpells = [],
  downSpells = [],
  unmatchedGap = "away",
  intervalSec = FOCUS_SAMPLE_INTERVAL_SEC,
}: TimelineInput): FocusTimeline => {
  const intervalMs = intervalSec * 1000;
  const timed = samples
    .map((s) => ({ t: new Date(s.timestamp).getTime(), v: s.computedFocus }))
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v))
    .sort((a, b) => a.t - b.t);

  const totalSec =
    startedAtMs !== null ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000)) : 0;
  const sum = (spells: FocusSpell[]) => spells.reduce((a, s) => a + s.durationSec, 0);

  const segments: TraceSegment[] = [];

  // One interval of a gap, classified by where in time it sits.
  const fillGap = (fromMs: number, slots: number) => {
    for (let i = 0; i < slots; i += 1) {
      const at = fromMs + (i + 0.5) * intervalMs;
      if (covers(awaySpells, at, intervalMs)) segments.push({ kind: "away" });
      else if (covers(downSpells, at, intervalMs)) segments.push({ kind: "down" });
      else segments.push({ kind: unmatchedGap });
    }
  };
  const isGap = (ms: number) => ms > intervalMs * GAP_TOLERANCE;

  if (timed.length > 0) {
    // Before the first sample. Normally there is none - one is sent at start.
    if (startedAtMs !== null && isGap(timed[0].t - startedAtMs)) {
      fillGap(startedAtMs, Math.floor((timed[0].t - startedAtMs) / intervalMs));
    }

    timed.forEach((sample, i) => {
      if (i > 0) {
        const gap = sample.t - timed[i - 1].t;
        // The intervals that should have held a sample and did not.
        if (isGap(gap)) fillGap(timed[i - 1].t, Math.round(gap / intervalMs) - 1);
      }
      segments.push({ kind: "focus", value: Math.min(1, Math.max(0, sample.v)) });
    });

    // After the last sample: ended from another app, or still away right now.
    const last = timed[timed.length - 1].t;
    if (isGap(endedAtMs - last)) fillGap(last, Math.floor((endedAtMs - last) / intervalMs));
  }

  const counted = segments.filter((s) => s.kind !== "down");
  const average =
    counted.length > 0
      ? Math.round(
          (counted.reduce((a, s) => a + (s.kind === "focus" ? s.value : 0), 0) /
            counted.length) *
            100,
        )
      : null;

  return {
    segments,
    average,
    totalSec,
    awaySec: Math.round(sum(awaySpells)),
    // A finished session has no record of phone-down spells, only the gaps
    // they left, so those are counted from the chart itself.
    downSec:
      downSpells.length > 0
        ? Math.round(sum(downSpells))
        : segments.filter((s) => s.kind === "down").length * intervalSec,
    awayCount: awaySpells.length,
  };
};

/**
 * A finished session's interruptions as spells.
 *
 * The server stamps an interruption when it is POSTed, which is when the user
 * came back - so its startedAt is the END of the time away.
 */
export const interruptionsToSpells = (
  interruptions: { startedAt: string | number | Date; durationSec: number }[],
): FocusSpell[] =>
  interruptions
    .map((i) => ({ endMs: new Date(i.startedAt).getTime(), durationSec: i.durationSec }))
    .filter((s) => Number.isFinite(s.endMs) && s.durationSec > 0);
