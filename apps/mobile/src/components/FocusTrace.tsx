import { Text, View } from "react-native";

import { useTheme, useStyles, TRACE_GRID_LINES } from "@theme";
import type { FocusTimeline, TraceSegment } from "@data";

/**
 * How focus moved across a session, and where the time went.
 *
 * Built for accountability rather than decoration: every 15 seconds of the
 * session is one bar, and what the user did shows up as a change they can see.
 *  - Focus bars rise and fall with the per-sample estimate, so a restless phone
 *    is a visible dip, not a slightly paler green.
 *  - Time in another app is a full-height red block. It used to be invisible -
 *    no sample is taken while the app is suspended - which made a session with
 *    two Instagram breaks look perfect.
 *  - Phone-down time (locked and left on the desk) is a calm blue block, so it
 *    is visibly different from both.
 *  - A break is a quiet grey block: a pause the user took, which counts for
 *    nothing either way.
 * Underneath, a one-line strip and totals say the same thing in proportions and
 * minutes.
 *
 * Bars rather than a line: samples are scored independently, so a connecting
 * line would imply a continuity between them that the estimate does not have.
 */
interface FocusTraceProps {
  timeline: FocusTimeline;
  /** A running session: drops the axis and labels it as live. */
  live?: boolean;
}

/** Beyond this the bars are thinner than the gaps between them. */
const MAX_BARS = 44;

/**
 * Buckets segments down to MAX_BARS. A bucket takes its most common kind;
 * focus buckets average their values. Averaging rather than picking every nth
 * keeps short dips and short absences visible.
 */
const downsample = (segments: TraceSegment[]): TraceSegment[] => {
  if (segments.length <= MAX_BARS) return segments;

  const bucket = segments.length / MAX_BARS;
  return Array.from({ length: MAX_BARS }, (_, i) => {
    const slice = segments.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    const count = (kind: TraceSegment["kind"]) => slice.filter((s) => s.kind === kind).length;
    const focus = slice.filter((s): s is Extract<TraceSegment, { kind: "focus" }> => s.kind === "focus");

    if (count("break") > focus.length && count("break") >= count("away")) return { kind: "break" };
    if (count("away") >= focus.length && count("away") >= count("down")) return { kind: "away" };
    if (count("down") > focus.length) return { kind: "down" };
    return { kind: "focus", value: focus.reduce((a, s) => a + s.value, 0) / Math.max(1, focus.length) };
  });
};

/**
 * Axis labels in whatever unit keeps the four marks distinct. The unit is chosen
 * from the WHOLE session: minutes on a 90-second session round every mark to
 * "0m" and the axis reads as broken.
 */
const timeLabel = (sec: number, totalSec: number) => {
  if (totalSec < 300) return `${Math.round(sec)}s`;

  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;

  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
};

const duration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 || m >= 10 ? `${m}m` : `${m}m ${rest}s`;
};

const FocusTrace = ({ timeline, live = false }: FocusTraceProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");

  const { segments, average, totalSec, awaySec, downSec, breakSec, awayCount } = timeline;
  if (segments.length === 0) return null;

  const bars = downsample(segments);

  const bandColor = (v: number) =>
    v >= 0.7 ? colors.success : v >= 0.45 ? colors.warning : colors.danger;

  const colorOf = (s: TraceSegment) =>
    s.kind === "away"
      ? colors.danger
      : s.kind === "down"
        ? colors.primary
        : s.kind === "break"
          ? colors.textMuted
          : bandColor(s.value);

  // Consecutive same-colour bars merged into runs, for the strip.
  const runs: { color: string; length: number }[] = [];
  for (const bar of bars) {
    const color = colorOf(bar);
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.length += 1;
    else runs.push({ color, length: 1 });
  }

  const presentSec = Math.max(0, totalSec - awaySec - downSec - breakSec);
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => timeLabel(totalSec * f, totalSec));

  return (
    <View style={styles.traceCard}>
      <View style={styles.traceHeader}>
        <Text style={styles.traceTitle}>Focus over time</Text>
        {live ? (
          <Text style={styles.traceLiveTag}>● live</Text>
        ) : (
          <Text style={styles.traceAvg}>avg {average ?? "–"}</Text>
        )}
      </View>

      <View style={styles.tracePlotRow}>
        <View style={styles.tracePlot}>
          {/* Grid behind the bars, so the height of one can be read as a value. */}
          {TRACE_GRID_LINES.map((line) => (
            <View key={line} style={[styles.traceGrid, { bottom: `${line}%` }]} />
          ))}

          <View style={styles.traceBars}>
            {bars.map((bar, i) =>
              bar.kind === "away" ? (
                <View key={i} style={styles.traceAwayBar} />
              ) : bar.kind === "down" ? (
                <View key={i} style={styles.traceDownBar} />
              ) : bar.kind === "break" ? (
                <View key={i} style={styles.traceBreakBar} />
              ) : (
                <View
                  key={i}
                  style={[
                    styles.traceBar,
                    {
                      // A floor, so a zero-focus interval is a visible mark
                      // rather than a gap that reads as missing data.
                      height: `${Math.max(5, bar.value * 100)}%`,
                      backgroundColor: bandColor(bar.value),
                    },
                  ]}
                />
              ),
            )}
          </View>
        </View>

        <View style={styles.traceYAxis}>
          <Text style={styles.traceTick}>100</Text>
          <Text style={styles.traceTick}>50</Text>
          <Text style={styles.traceTick}>0</Text>
        </View>
      </View>

      {live ? null : (
        <View style={styles.traceXAxis}>
          <Text style={styles.traceTick}>{totalSec < 300 ? "0s" : "0m"}</Text>
          {ticks.map((label, i) => (
            <Text key={i} style={styles.traceTick}>
              {label}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.traceRibbon} accessibilityElementsHidden>
        {runs.map((run, i) => (
          <View
            key={i}
            style={[styles.traceRibbonPart, { flex: run.length, backgroundColor: run.color }]}
          />
        ))}
      </View>

      <View style={styles.traceLegend}>
        <View style={styles.traceLegendItem}>
          <View style={[styles.traceLegendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.traceLegendText}>
            <Text style={styles.traceLegendStrong}>{duration(presentSec)}</Text> in app
          </Text>
        </View>
        {awaySec > 0 ? (
          <View style={styles.traceLegendItem}>
            <View style={[styles.traceLegendDot, { backgroundColor: colors.danger }]} />
            <Text style={styles.traceLegendText}>
              <Text style={styles.traceLegendStrong}>{duration(awaySec)}</Text> away
              {awayCount > 1 ? ` · ${awayCount} trips` : ""}
            </Text>
          </View>
        ) : null}
        {downSec > 0 ? (
          <View style={styles.traceLegendItem}>
            <View style={[styles.traceLegendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.traceLegendText}>
              <Text style={styles.traceLegendStrong}>{duration(downSec)}</Text> phone down
            </Text>
          </View>
        ) : null}
        {breakSec > 0 ? (
          <View style={styles.traceLegendItem}>
            <View style={[styles.traceLegendDot, { backgroundColor: colors.textMuted }]} />
            <Text style={styles.traceLegendText}>
              <Text style={styles.traceLegendStrong}>{duration(breakSec)}</Text> on a break
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default FocusTrace;
