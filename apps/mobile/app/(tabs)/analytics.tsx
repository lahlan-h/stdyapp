import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useAnalyticsStyles,
  useTabBarClearance,
  ANALYTICS_ICON_SIZE,
  DAILY_CHART_HEIGHT,
  HOURLY_CHART_HEIGHT,
} from "@theme";
import { useAnalytics, type Analytics, type AnalyticsRange, type GoalHitRate } from "@data";

import AnalyticsBarChart from "@components/AnalyticsBarChart";
import AnalyticsStatTile from "@components/AnalyticsStatTile";

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

/** Shown wherever there is nothing to measure. Never a 0 that reads as a result. */
const NONE = "–";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// --- Formatting ---------------------------------------------------------------

/** 45 -> "45m", 125 -> "2h 5m", 120 -> "2h". */
const formatMinutes = (minutes: number | null): string => {
  if (minutes === null) return NONE;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const formatSeconds = (seconds: number | null): string => {
  if (seconds === null) return NONE;
  return seconds < 60 ? `${seconds}s` : formatMinutes(Math.round(seconds / 60));
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The API's date keys are LABELS in the user's zone ("2026-09-22"), not
 * instants. Parsed by hand rather than through new Date(), which would read
 * them as UTC midnight and render the previous day anywhere west of Greenwich.
 */
const parseKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  // Only used for the weekday, which UTC gets right for a bare calendar date.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { month: month - 1, day, weekday };
};

/** "Tue 22 Sep" */
const formatDay = (key: string) => {
  const { weekday, day, month } = parseKey(key);
  return `${WEEKDAYS[weekday]} ${day} ${MONTHS[month]}`;
};

/** "22 Sep" */
const formatShortDay = (key: string) => {
  const { day, month } = parseKey(key);
  return `${day} ${MONTHS[month]}`;
};

/** 0 -> "12am", 13 -> "1pm". */
const formatHour = (hour: number) => {
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
};

/**
 * Under the daily chart: every weekday for a week, three dates for a month.
 * Thirty labels would not fit, and three is enough to locate any bar.
 */
const dailyAxisLabels = (daily: Analytics["focusTime"]["daily"]) => {
  if (daily.length <= 7) return daily.map(({ date }) => WEEKDAYS[parseKey(date).weekday].charAt(0));
  const middle = daily[Math.floor(daily.length / 2)];
  return [daily[0], middle, daily[daily.length - 1]].map(({ date }) => formatShortDay(date));
};

const HOURLY_AXIS = [0, 6, 12, 18, 23].map(formatHour);

// --- Screen -------------------------------------------------------------------

/**
 * Personal study analytics. A tab: the add-post circle moved from the tab bar
 * to the Feed, which freed the slot.
 *
 * Every number comes from GET /api/analytics/me; nothing is computed here
 * beyond formatting. Keeping the arithmetic on the server is what lets the
 * API's tests cover it, and what will let the web app show the same numbers.
 */
const AnalyticsScreen = () => {
  const { colors } = useTheme();
  const styles = useAnalyticsStyles();
  // What the floating tab bar covers, inset included - see useTabBarClearance.
  const tabBarClearance = useTabBarClearance();
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const { analytics, isLoading, loadError, reload } = useAnalytics(range);

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarClearance + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              // Only once something is on screen - the first load has its own
              // spinner below, and two at once looks like a glitch.
              refreshing={isLoading && !!analytics}
              onRefresh={reload}
              tintColor={colors.textMuted}
            />
          }
        >
          {/* No back button: a tab is somewhere you are, not somewhere you went. */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Analytics</Text>
          </View>

          <View style={styles.segmentGroup} accessibilityRole="tablist">
            {RANGES.map(({ key, label }) => {
              const isSelected = key === range;
              return (
                <Pressable
                  key={key}
                  style={[styles.segment, isSelected && styles.segmentSelected]}
                  onPress={() => setRange(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.segmentLabel, isSelected && styles.segmentLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loadError ? (
            <Pressable style={styles.error} onPress={reload} accessibilityRole="button">
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>
                {loadError}
                {"\n"}Tap to try again.
              </Text>
            </Pressable>
          ) : null}

          {!analytics ? (
            isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
          ) : (
            <AnalyticsBody analytics={analytics} />
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

/**
 * Everything below the range switch. Split out so the screen above only deals
 * with loading and errors, and this only deals with a payload that exists.
 */
const AnalyticsBody = ({ analytics }: { analytics: Analytics }) => {
  const { colors } = useTheme();
  const styles = useAnalyticsStyles();
  const { range, focusTime, sessions, focusQuality, goals, consistency, peakHours } = analytics;

  const dailyValues = focusTime.daily.map(({ minutes }) => minutes);
  const bestDay = Math.max(0, ...dailyValues);
  const studiedMinutes = sessions.soloMinutes + sessions.groupMinutes;

  return (
    <>
      {sessions.count === 0 ? (
        <View style={styles.notice}>
          <Feather name="info" size={ANALYTICS_ICON_SIZE} color={colors.textMuted} />
          <Text style={styles.noticeText}>
            No finished sessions in the last {range.days} days. These numbers fill in as you
            complete study sessions.
          </Text>
        </View>
      ) : null}

      {/* 1. Focus time - the headline, then the shape of it. */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Focus time</Text>
        <Text style={styles.heroValue}>{formatMinutes(focusTime.totalMinutes)}</Text>
        <Trend focusTime={focusTime} days={range.days} />
        <AnalyticsBarChart
          // Keyed on the range so switching 7d/30d remounts the chart and drops
          // the tapped bar - index 5 of a week is not index 5 of a month.
          key={range.key}
          values={dailyValues}
          height={DAILY_CHART_HEIGHT}
          plotStyle={styles.dailyPlot}
          axisLabels={dailyAxisLabels(focusTime.daily)}
          describe={(index) =>
            `${formatDay(focusTime.daily[index].date)} · ${formatMinutes(dailyValues[index])}`
          }
          summary={bestDay > 0 ? `Best day: ${formatMinutes(bestDay)} · tap a bar` : "No study yet"}
        />
      </View>

      {/* 2-4, 6. The headline numbers, two to a row. */}
      <View style={styles.tileGrid}>
        <AnalyticsStatTile
          icon="clock"
          label="Sessions"
          value={String(sessions.count)}
          detail={
            sessions.count > 0
              ? `avg ${formatMinutes(sessions.averageMinutes)} · longest ${formatMinutes(sessions.longestMinutes)}`
              : undefined
          }
        />
        <AnalyticsStatTile
          icon="target"
          label="Focus efficiency"
          value={focusQuality.efficiencyPercent === null ? NONE : `${focusQuality.efficiencyPercent}%`}
          detail={`${focusQuality.focusPoints} focus points kept`}
        />
        <AnalyticsStatTile
          icon="bell-off"
          label="Interruptions"
          value={
            focusQuality.interruptionsPerHour === null
              ? NONE
              : `${focusQuality.interruptionsPerHour}/hr`
          }
          detail={
            focusQuality.interruptionCount > 0
              ? `${focusQuality.interruptionCount} total · ${focusQuality.penaltyCount} penalised · avg ${formatSeconds(focusQuality.averageAwaySec)} away`
              : "None logged"
          }
        />
        <AnalyticsStatTile
          icon="calendar"
          label="Active days"
          value={`${consistency.activeDays}/${range.days}`}
          detail={`Longest run: ${plural(consistency.longestRunDays, "day")}`}
        />
        <AnalyticsStatTile
          icon="zap"
          label="Current streak"
          value={plural(consistency.currentStreak, "day")}
          detail={
            consistency.isActiveToday
              ? "Studied today"
              : consistency.currentStreak > 0
                ? "Study today to keep it going"
                : "Finish a session to start one"
          }
        />
        <AnalyticsStatTile
          icon="users"
          label="Group study"
          value={
            studiedMinutes > 0
              ? `${Math.round((sessions.groupMinutes / studiedMinutes) * 100)}%`
              : NONE
          }
          detail={`${formatMinutes(sessions.soloMinutes)} solo · ${formatMinutes(sessions.groupMinutes)} group`}
        />
      </View>

      {/* 5. Goals */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Goals</Text>
        <GoalRow label="Daily goal" unit="day" goal={goals.daily} />
        <GoalRow label="Weekly goal" unit="week" goal={goals.weekly} />
        <Text style={styles.cardFootnote}>
          Today and this week only count once you have met them. Past days are judged against your
          current targets.
        </Text>
      </View>

      {/* 7. Peak hours */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>When you focus</Text>
        <AnalyticsBarChart
          key={range.key}
          values={peakHours.hourly}
          height={HOURLY_CHART_HEIGHT}
          plotStyle={styles.hourlyPlot}
          axisLabels={HOURLY_AXIS}
          describe={(hour) =>
            `${formatHour(hour)}–${formatHour((hour + 1) % 24)} · ${formatMinutes(peakHours.hourly[hour])}`
          }
          summary={
            peakHours.peakHour === null
              ? "No study yet"
              : `Most focused around ${formatHour(peakHours.peakHour)}`
          }
        />
      </View>

      <Text style={styles.cardFootnote}>
        Days and hours are in {range.timeZone}. Streaks still count UTC days, so a streak can
        disagree with the chart for part of the day.
      </Text>
    </>
  );
};

/**
 * "vs the previous period" under the hero number.
 *
 * The arrow carries the direction and the colour; the words carry it too, so
 * neither colour nor the icon alone has to be read.
 */
const Trend = ({ focusTime, days }: { focusTime: Analytics["focusTime"]; days: number }) => {
  const { colors } = useTheme();
  const styles = useAnalyticsStyles();
  const period = `the previous ${days} days`;
  const change = focusTime.changePercent;

  if (change === null) {
    return <Text style={styles.trendText}>Nothing logged in {period}</Text>;
  }

  const icon = change > 0 ? "arrow-up-right" : change < 0 ? "arrow-down-right" : "minus";
  const color = change > 0 ? colors.success : change < 0 ? colors.danger : colors.textMuted;
  const words =
    change === 0
      ? `Same as ${period}`
      : `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than ${period}`;

  return (
    <View style={styles.trendRow}>
      <Feather name={icon} size={ANALYTICS_ICON_SIZE} color={color} />
      <Text style={styles.trendText}>{words}</Text>
    </View>
  );
};

/** One goal's hit rate, as a sentence and a meter. */
const GoalRow = ({
  label,
  unit,
  goal,
}: {
  label: string;
  unit: "day" | "week";
  goal: GoalHitRate | null;
}) => {
  const styles = useAnalyticsStyles();

  if (!goal) {
    return (
      <View style={styles.goalRow}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalLabel}>{label}</Text>
          <Text style={styles.tileDetail}>Not set</Text>
        </View>
      </View>
    );
  }

  const value =
    goal.counted === 0 ? "Nothing to judge yet" : `${goal.met} of ${plural(goal.counted, unit)}`;

  return (
    <View style={styles.goalRow}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalLabel}>
          {label} · {formatMinutes(goal.targetMinutes)}
        </Text>
        <Text style={styles.goalValue}>{value}</Text>
      </View>
      <View
        style={styles.meterTrack}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityValue={{ min: 0, max: 100, now: goal.hitRatePercent ?? 0 }}
      >
        <View style={[styles.meterFill, { width: `${goal.hitRatePercent ?? 0}%` }]} />
      </View>
    </View>
  );
};

export default AnalyticsScreen;
