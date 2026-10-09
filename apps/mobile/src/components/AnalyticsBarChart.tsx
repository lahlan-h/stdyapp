import { useState } from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";

import { useStyles, MIN_VISIBLE_BAR } from "@theme";

interface AnalyticsBarChartProps {
  /** One value per bar, in axis order. */
  values: number[];
  /** Plot height in px - must match the height in `plotStyle`. */
  height: number;
  /** dailyPlot or hourlyPlot from the analytics stylesheet. */
  plotStyle: StyleProp<ViewStyle>;
  /** Labels spread evenly under the plot, first to last. Not one per bar. */
  axisLabels: string[];
  /** The readout for a tapped bar, e.g. "Tue 22 Sep - 1h 5m". */
  describe: (index: number) => string;
  /** What the readout says when no bar is tapped. */
  summary: string;
}

/**
 * One series of bars, drawn with Views rather than SVG.
 *
 * react-native-svg is installed, but a bar is a rectangle and a View already
 * is one - with rounded corners, press handling and accessibility for free,
 * and nothing to keep in step between two coordinate systems.
 *
 * TAP A BAR TO READ IT, tap again to clear. This is the touch version of a
 * hover tooltip: the value appears in the readout line above the plot rather
 * than in a floating box, which on a phone would sit under the finger that
 * tapped it. Everything else dims so the tapped bar is findable.
 *
 * No y axis. A single series with a readout on tap does not need one, and the
 * summary line above the chart carries the scale ("most: 1h 30m").
 */
const AnalyticsBarChart = ({
  values,
  height,
  plotStyle,
  axisLabels,
  describe,
  summary,
}: AnalyticsBarChartProps) => {
  const styles = useStyles("analytics");
  const [selected, setSelected] = useState<number | null>(null);

  const max = Math.max(0, ...values);

  // Proportional to the largest bar, so the tallest always fills the plot.
  // Floored at MIN_VISIBLE_BAR above zero - see the note on that constant.
  const barHeight = (value: number) =>
    value > 0 && max > 0 ? Math.max(MIN_VISIBLE_BAR, (value / max) * height) : 0;

  // Belt and braces for a caller that changes the bar count without remounting
  // (the analytics screen keys each chart on its range, which does). An index
  // past the end is treated as no selection rather than read as undefined.
  const active = selected !== null && selected < values.length ? selected : null;

  return (
    <View>
      <Text style={styles.chartReadout}>{active === null ? summary : describe(active)}</Text>

      <View style={[styles.chartPlot, plotStyle]}>
        {values.map((value, index) => (
          <Pressable
            // Position IS identity here: bar N is always day/hour N of the range.
            key={index}
            style={styles.barColumn}
            onPress={() => setSelected(active === index ? null : index)}
            accessibilityRole="button"
            accessibilityLabel={describe(index)}
            accessibilityState={{ selected: active === index }}
          >
            <View
              style={[
                styles.bar,
                { height: barHeight(value) },
                active !== null && active !== index && styles.barDimmed,
              ]}
            />
          </Pressable>
        ))}
      </View>

      <View style={styles.axisRow}>
        {axisLabels.map((label, index) => (
          <Text key={`${index}-${label}`} style={styles.axisLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

export default AnalyticsBarChart;
