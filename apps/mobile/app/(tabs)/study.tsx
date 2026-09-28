import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useTabBarClearance,
  STUDY_FOOTER_ROOM,
  STUDY_ICON_SIZE,
} from "@theme";
import { useFocusSession } from "@data";

/**
 * The focus session screen.
 *
 * FIRST PASS, and deliberately plain. The rest of the app's visual language is
 * still being set, so this uses only existing tokens and the same card / chip /
 * stat shapes settings and the feed already use. Expect it to be restyled once
 * the wider design lands - nothing here holds a colour of its own, so that is a
 * change to study.styles.ts and not to this file.
 *
 * The score is an ESTIMATE from phone sensors, and the copy says so on screen.
 * It is not a measurement of attention and must never be presented as one.
 */

/** Presets, plus "none" - an open-ended session is a real way to study. */
const PLAN_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "25m", minutes: 25 },
  { label: "50m", minutes: 50 },
  { label: "90m", minutes: 90 },
  { label: "None", minutes: null },
];

const RATINGS = [1, 2, 3, 4, 5];

const formatClock = (totalSec: number) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatAway = (sec: number) => {
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}m`;
};

const Study = () => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const tabBarClearance = useTabBarClearance();

  const {
    phase,
    elapsedSec,
    plannedMinutes,
    setPlannedMinutes,
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
  } = useFocusSession();

  const running = phase === "running";
  const finished = phase === "finished";

  /**
   * What the dial shows: the server's running average while a session is live,
   * and the official estimate once it has ended.
   */
  const shown = finished ? (result?.focusScore ?? null) : liveFocus;

  /**
   * Bands, not a gradient. The estimate is not precise enough to justify one,
   * and three states are what a glance can actually read.
   */
  const bandStyle =
    shown === null
      ? styles.dialActive
      : shown >= 70
        ? styles.dialGood
        : shown >= 45
          ? styles.dialMid
          : styles.dialPoor;

  const planTarget = plannedMinutes ? ` / ${formatClock(plannedMinutes * 60)}` : "";

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tabBarClearance + STUDY_FOOTER_ROOM },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.screenTitle}>Focus</Text>
            <Text style={styles.screenSubtitle}>
              {running
                ? "Recording. Leave the app and it counts against you."
                : finished
                  ? "Session complete"
                  : "Start a session to track how focused you are"}
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.dialWrap}>
            <View style={[styles.dial, bandStyle]}>
              <Text style={styles.dialValue}>{shown === null ? "—" : shown}</Text>
              <Text style={styles.dialLabel}>
                {finished ? "focus estimate" : running ? "live average" : "focus"}
              </Text>
              <Text style={styles.dialNote}>an estimate, not a measurement</Text>
            </View>
          </View>

          <View>
            <Text style={styles.timerLabel}>elapsed</Text>
            <Text style={styles.timer}>
              {formatClock(elapsedSec)}
              {planTarget}
            </Text>
          </View>

          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{sampleCount}</Text>
              <Text style={styles.statLabel}>samples</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, awaySec > 0 && styles.statWarn]}>
                {awaySec > 0 ? formatAway(awaySec) : "0s"}
              </Text>
              <Text style={styles.statLabel}>away</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {result?.focusWeightedMinutes == null
                  ? "—"
                  : result.focusWeightedMinutes.toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>wtd min</Text>
            </View>
            <View style={styles.stat}>
              {/* The other feature's number, shown beside ours and never merged
                  into it - they answer different questions. */}
              <Text style={styles.statValue}>{result?.focusPoints ?? "—"}</Text>
              <Text style={styles.statLabel}>points</Text>
            </View>
          </View>

          {!running && !finished ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Planned length</Text>
              <View style={styles.chipRow}>
                {PLAN_OPTIONS.map((option) => {
                  const selected = plannedMinutes === option.minutes;
                  return (
                    <Pressable
                      key={option.label}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setPlannedMinutes(option.minutes)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Planned length ${option.label}`}
                    >
                      <Text
                        style={[styles.chipText, selected && styles.chipTextSelected]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.helpText}>
                Finishing what you planned counts towards the estimate. Stopping
                early lowers it; running over does not raise it.
              </Text>
            </View>
          ) : null}

          {finished ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How focused did that feel?</Text>
              <View style={styles.ratingRow}>
                {RATINGS.map((value) => {
                  const selected = rating === value;
                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.ratingButton,
                        selected && styles.ratingButtonSelected,
                      ]}
                      onPress={() => rate(value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Rate this session ${value} out of 5`}
                    >
                      <Text
                        style={[
                          styles.ratingText,
                          selected && styles.ratingTextSelected,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.helpText}>
                Your answer is what the estimate is checked against. It is the only
                way to tell whether the score is any good.
              </Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.action,
              running && styles.actionStop,
              busy && styles.actionDisabled,
            ]}
            disabled={busy}
            onPress={running ? end : finished ? reset : start}
            accessibilityRole="button"
            accessibilityLabel={
              running ? "End session" : finished ? "Start a new session" : "Start session"
            }
          >
            <Feather
              name={running ? "square" : "play"}
              size={STUDY_ICON_SIZE}
              color={colors.surface}
            />
            <Text style={styles.actionText}>
              {busy
                ? "Working…"
                : running
                  ? "End session"
                  : finished
                    ? "New session"
                    : "Start session"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Study;
