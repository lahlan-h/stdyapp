import { Text, View } from "react-native";

import { useTheme, useStyles, TRACE_GRID_LINES } from "@theme";

/**
 * How focus moved across a session.
 *
 * Bars rather than a line, and that is a dependency decision as much as a
 * design one: a polyline needs react-native-svg, which this app does not carry.
 * Bars are also the more honest mark here - samples are 15 seconds apart and
 * each is scored independently, so a connecting line would imply a continuity
 * between them that the estimate does not have.
 *
 * Axes carry real values: the y-grid is the 0-100 the score is on, and the
 * x-labels are this session's own elapsed times, so the shape can be read
 * against when it happened rather than as a decorative squiggle.
 */
interface FocusTraceProps {
  /** Per-sample scores in time order, each 0-1. */
  values: number[];
  /** Session length in seconds, for the time axis. */
  totalSec: number;
}

/** Beyond this the bars are thinner than the gaps between them. */
const MAX_BARS = 44;

const downsample = (values: number[]): number[] => {
  if (values.length <= MAX_BARS) return values;

  // Bucket averages rather than every nth value: dropping samples would hide
  // exactly the short dips this chart exists to show.
  const bucket = values.length / MAX_BARS;
  return Array.from({ length: MAX_BARS }, (_, i) => {
    const slice = values.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  });
};

/**
 * Axis labels in whatever unit keeps the four marks distinct.
 *
 * The unit is chosen from the WHOLE session, not per label: minutes on a
 * 90-second session round every mark to "0m" and the axis reads as broken,
 * which is exactly what a short test session produces.
 */
const timeLabel = (sec: number, totalSec: number) => {
  if (totalSec < 300) return `${Math.round(sec)}s`;

  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;

  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
};

const FocusTrace = ({ values, totalSec }: FocusTraceProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");

  if (values.length === 0) return null;

  const bars = downsample(values);
  const average = Math.round(
    (values.reduce((a, b) => a + b, 0) / values.length) * 100,
  );

  const bandColor = (v: number) =>
    v >= 0.7 ? colors.success : v >= 0.45 ? colors.warning : colors.danger;

  // Four marks across the session, the last one being its full length.
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => timeLabel(totalSec * f, totalSec));

  return (
    <View style={styles.traceCard}>
      <View style={styles.traceHeader}>
        <Text style={styles.traceTitle}>Focus over time</Text>
        <Text style={styles.traceAvg}>avg {average}</Text>
      </View>

      <View style={styles.tracePlotRow}>
        <View style={styles.tracePlot}>
          {/* Grid behind the bars, so the height of one can be read as a value. */}
          {TRACE_GRID_LINES.map((line) => (
            <View key={line} style={[styles.traceGrid, { bottom: `${line}%` }]} />
          ))}

          <View style={styles.traceBars}>
            {bars.map((value, i) => (
              <View
                key={i}
                style={[
                  styles.traceBar,
                  {
                    // A floor, so a zero-focus interval is a visible mark
                    // rather than a gap that reads as missing data.
                    height: `${Math.max(5, Math.min(1, value) * 100)}%`,
                    backgroundColor: bandColor(value),
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.traceYAxis}>
          <Text style={styles.traceTick}>100</Text>
          <Text style={styles.traceTick}>50</Text>
          <Text style={styles.traceTick}>0</Text>
        </View>
      </View>

      <View style={styles.traceXAxis}>
        <Text style={styles.traceTick}>{totalSec < 300 ? "0s" : "0m"}</Text>
        {ticks.map((label, i) => (
          <Text key={i} style={styles.traceTick}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

export default FocusTrace;
