import { useCallback, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { formatDuration } from "@stdyapp/shared";

import { useTheme, useStyles, MIN_VISIBLE_BAR, WEEK_CHART_HEIGHT, WEEK_PILL_ICON_SIZE } from "@theme";
import { useAnalytics, toWeekComparison } from "@data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Shown while there is nothing to measure yet. Never a 0 that reads as a result. */
const NONE = "–";

/** 1236 minutes -> "20.6": hours to one place, as the design shows them. */
const toHours = (minutes: number): string => (minutes / 60).toFixed(1);

/**
 * The analytics card at the top of the Study tab: hours this week, the change
 * on last week, and the two weeks side by side, a day at a time.
 *
 * A glance, not the analysis - "See Advanced Analytics" under it opens the
 * full page. So there is no range switch and nothing to tap on the chart.
 */
const WeeklyStudyCard = () => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  // 30 days rather than 7: the chart needs last week's days one by one, and the
  // 7-day range only totals them. See toWeekComparison.
  const { analytics, loadError, reload } = useAnalytics("30d");

  /**
   * Re-read whenever Study comes back into view, so a session finished a
   * moment ago is already in today's bar. The first focus is skipped because
   * the hook has just loaded on mount, and two identical requests at once
   * would only race each other.
   */
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) reload();
      focusedBefore.current = true;
    }, [reload]),
  );

  const week = analytics
    ? toWeekComparison(analytics.focusTime.daily, analytics.range.to)
    : undefined;

  // One scale for both weeks, so a taller bar always means more study.
  const max = week ? Math.max(0, ...week.lastWeek, ...week.thisWeek.map((day) => day ?? 0)) : 0;
  const barHeight = (minutes: number | null) =>
    minutes && max > 0 ? Math.max(MIN_VISIBLE_BAR, (minutes / max) * WEEK_CHART_HEIGHT) : 0;

  const change = week?.changePercent ?? null;
  const up = change !== null && change >= 0;

  // The chart is drawn, not read, so it carries the numbers for a screen
  // reader in one label rather than fourteen unlabelled bars.
  const chartLabel = week
    ? DAYS.map((day, index) => {
        const thisWeek = week.thisWeek[index];
        const now = thisWeek === null ? "still to come" : formatDuration(thisWeek);
        return `${day}: ${now} this week, ${formatDuration(week.lastWeek[index])} last week`;
      }).join(". ")
    : "Loading";

  return (
    <LinearGradient
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.weekCard}
    >
      <Text style={styles.weekTitle}>Analytics</Text>

      <View style={styles.weekHeadline}>
        <View>
          <Text style={styles.weekCaption}>This week</Text>
          <View style={styles.weekTotalRow}>
            <Text style={styles.weekTotal}>{week ? toHours(week.thisWeekMinutes) : NONE}</Text>
            <Text style={styles.weekUnit}>hrs</Text>
          </View>
        </View>

        {/* Absent rather than "+0%" when last week had nothing to compare with. */}
        {change !== null ? (
          <View
            style={[
              styles.weekPill,
              up
                ? { backgroundColor: colors.successTint, borderColor: colors.successEdge }
                : { backgroundColor: colors.dangerTint, borderColor: colors.dangerEdge },
            ]}
          >
            <Feather
              name={up ? "trending-up" : "trending-down"}
              size={WEEK_PILL_ICON_SIZE}
              color={up ? colors.success : colors.danger}
            />
            <Text style={[styles.weekPillText, { color: up ? colors.success : colors.danger }]}>
              {up ? "+" : ""}
              {change}% vs last week
            </Text>
          </View>
        ) : null}
      </View>

      {loadError && !analytics ? (
        <Pressable onPress={reload} accessibilityRole="button">
          <Text style={styles.weekError}>{loadError} Tap to try again.</Text>
        </Pressable>
      ) : null}

      <View style={styles.weekChart} accessible accessibilityLabel={chartLabel}>
        {DAYS.map((day, index) => (
          <View key={day} style={styles.weekDay}>
            <View
              style={[
                styles.weekBar,
                styles.weekBarLast,
                { height: barHeight(week?.lastWeek[index] ?? null) },
              ]}
            />
            <View style={[styles.weekBar, { height: barHeight(week?.thisWeek[index] ?? null) }]} />
          </View>
        ))}
      </View>

      <View style={styles.weekAxis}>
        {DAYS.map((day) => (
          <Text key={day} style={styles.weekAxisLabel}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.weekLegend}>
        <View style={styles.weekLegendItem}>
          <View style={[styles.weekLegendSwatch, styles.weekBarLast]} />
          <Text style={styles.weekLegendLabel}>Last week</Text>
        </View>
        <View style={styles.weekLegendItem}>
          <View style={styles.weekLegendSwatch} />
          <Text style={styles.weekLegendLabel}>This week</Text>
        </View>
      </View>
    </LinearGradient>
  );
};

export default WeeklyStudyCard;
