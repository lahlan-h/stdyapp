import { Text, View } from "react-native";

import { useTheme, useStyles } from "@theme";

/**
 * How focus moved across a session, one bar per sample.
 *
 * Bars rather than a line for the same reason FocusDial uses ticks - a polyline
 * needs react-native-svg - but bars are also the more honest mark here. The
 * samples are 15 seconds apart and independently scored; a connecting line
 * would imply the estimate was continuous between them, which it is not.
 *
 * Colours come from the same three bands as the dial, so a glance at the shape
 * and a glance at the score tell the same story.
 */
interface FocusTraceProps {
  /** Per-sample scores in time order, each 0-1. */
  values: number[];
}

/** Beyond this the bars are thinner than the gaps, so the trace is downsampled. */
const MAX_BARS = 48;

const downsample = (values: number[]): number[] => {
  if (values.length <= MAX_BARS) return values;

  // Bucket averages, not every nth value: dropping samples would hide exactly
  // the short dips this chart exists to show.
  const bucket = values.length / MAX_BARS;
  return Array.from({ length: MAX_BARS }, (_, i) => {
    const slice = values.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  });
};

const FocusTrace = ({ values }: FocusTraceProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");

  if (values.length === 0) return null;

  const bars = downsample(values);
  const bandColor = (v: number) =>
    v >= 0.7 ? colors.success : v >= 0.45 ? colors.warning : colors.danger;

  return (
    <View style={styles.traceCard}>
      <View style={styles.traceHeader}>
        <Text style={styles.traceTitle}>Focus over the session</Text>
        <Text style={styles.traceMeta}>{values.length} samples</Text>
      </View>

      <View style={styles.tracePlot}>
        {bars.map((value, i) => (
          <View
            key={i}
            style={[
              styles.traceBar,
              {
                // A floor, so a zero-focus interval is still a visible mark
                // rather than a gap that reads as missing data.
                height: `${Math.max(6, Math.min(1, value) * 100)}%`,
                backgroundColor: bandColor(value),
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.traceAxis}>
        <Text style={styles.traceMeta}>start</Text>
        <Text style={styles.traceMeta}>end</Text>
      </View>
    </View>
  );
};

export default FocusTrace;
