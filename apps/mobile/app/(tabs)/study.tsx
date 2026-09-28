import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
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

import FocusDial from "@components/FocusDial";
import FocusTrace from "@components/FocusTrace";

/**
 * The focus session screen: set up, run, recap, rate.
 *
 * WRITTEN SHORT ON PURPOSE. The audience is students who already know how an
 * app works, and every sentence of explanation here is a sentence they will not
 * read. The controls carry the meaning instead - a dial, four chips, one
 * button - and the only prose left is the one line that says what the number
 * is, because that claim is the one we are not allowed to leave implied.
 *
 * Four states in one route, so no back gesture or deep link can land mid-
 * session with nothing running.
 *
 * Every colour is a palette token; the screen holds no hex of its own.
 */

const PRESETS = [25, 50, 90];
const RATINGS = [1, 2, 3, 4, 5];

/** Longest plan the API accepts, so the input cannot offer an invalid one. */
const MAX_PLANNED_MINUTES = 1440;

const clock = (totalSec: number) => {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const short = (totalSec: number) => {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/**
 * Bands, not a gradient. Two words land where a number needs interpreting, and
 * the estimate is not precise enough to justify finer grain.
 */
const band = (score: number | null) => {
  if (score === null) return { label: "No reading", key: "none" as const };
  if (score >= 80) return { label: "Deep focus", key: "good" as const };
  if (score >= 60) return { label: "Solid focus", key: "good" as const };
  if (score >= 40) return { label: "Patchy", key: "mid" as const };
  return { label: "Distracted", key: "poor" as const };
};

const Study = () => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const tabBarClearance = useTabBarClearance();

  const {
    phase,
    elapsedSec,
    remainingSec,
    plannedMinutes,
    setPlannedMinutes,
    liveFocus,
    awaySec,
    trace,
    result,
    rating,
    streakDays,
    error,
    busy,
    start,
    end,
    rate,
    goTo,
    reset,
  } = useFocusSession();

  /** Separate from plannedMinutes so a half-typed "1" is not a 1-minute plan. */
  const [customText, setCustomText] = useState("");

  const running = phase === "running";
  const score = running ? liveFocus : (result?.focusScore ?? null);
  const scoreBand = band(score);

  const bandColor =
    scoreBand.key === "good"
      ? colors.success
      : scoreBand.key === "mid"
        ? colors.warning
        : scoreBand.key === "poor"
          ? colors.danger
          : colors.primary;

  /**
   * With a plan the ring is a clock. Without one there is no end to fill
   * towards, so it fills by the focus reading instead - the only thing that
   * can meaningfully fill a ring in an open-ended session.
   */
  const dialProgress = running
    ? plannedMinutes
      ? elapsedSec / (plannedMinutes * 60)
      : (liveFocus ?? 0) / 100
    : (score ?? 0) / 100;

  const applyCustom = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "");
    setCustomText(digits);
    const value = parseInt(digits, 10);
    if (Number.isFinite(value) && value >= 1 && value <= MAX_PLANNED_MINUTES) {
      setPlannedMinutes(value);
    }
  };

  const choosePreset = (minutes: number | null) => {
    setPlannedMinutes(minutes);
    setCustomText("");
  };

  const Row = ({
    icon,
    label,
    children,
    first,
  }: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    children: React.ReactNode;
    first?: boolean;
  }) => (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={15} color={colors.textMuted} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );

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
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ---------------- set up ---------------- */}
          {phase === "idle" ? (
            <>
              <View style={styles.dialWrap}>
                <FocusDial progress={0} color={colors.primary}>
                  <Text style={styles.dialValue}>
                    {plannedMinutes ? clock(plannedMinutes * 60) : "∞"}
                  </Text>
                  <Text style={styles.dialCaption}>
                    {plannedMinutes ? "planned" : "no limit"}
                  </Text>
                </FocusDial>
              </View>

              <View style={styles.chipRow}>
                {PRESETS.map((minutes) => {
                  const selected = plannedMinutes === minutes && customText === "";
                  return (
                    <Pressable
                      key={minutes}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => choosePreset(minutes)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${minutes} minutes`}
                    >
                      <Text
                        style={[styles.chipText, selected && styles.chipTextSelected]}
                      >
                        {minutes}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.chip, plannedMinutes === null && styles.chipSelected]}
                  onPress={() => choosePreset(null)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: plannedMinutes === null }}
                  accessibilityLabel="No time limit"
                >
                  <Text
                    style={[
                      styles.chipText,
                      plannedMinutes === null && styles.chipTextSelected,
                    ]}
                  >
                    ∞
                  </Text>
                </Pressable>
              </View>

              <View style={styles.customRow}>
                <TextInput
                  style={styles.customInput}
                  value={customText}
                  onChangeText={applyCustom}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Custom"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Custom session length in minutes"
                />
                <Text style={styles.customUnit}>min</Text>
              </View>

              <Pressable
                style={[styles.action, busy && styles.actionDisabled]}
                disabled={busy}
                onPress={start}
                accessibilityRole="button"
                accessibilityLabel="Start session"
              >
                <Feather name="play" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>Start</Text>
              </Pressable>
            </>
          ) : null}

          {/* ---------------- running ---------------- */}
          {running ? (
            <>
              <View style={styles.dialWrap}>
                <FocusDial progress={dialProgress} color={bandColor}>
                  <Text style={styles.dialValue}>
                    {clock(remainingSec ?? elapsedSec)}
                  </Text>
                  <Text style={styles.dialCaption}>
                    {remainingSec === null ? "elapsed" : "left"}
                  </Text>
                </FocusDial>
              </View>

              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: bandColor }]} />
                <Text style={styles.statusText}>
                  {liveFocus === null ? "Reading…" : scoreBand.label}
                </Text>
              </View>

              {/* Shown only when there is something to say. */}
              {awaySec > 0 ? (
                <View style={styles.warnChip}>
                  <Feather name="log-out" size={13} color={colors.danger} />
                  <Text style={styles.warnChipText}>{short(awaySec)} away</Text>
                </View>
              ) : null}

              <Pressable
                style={[styles.action, styles.actionDanger, busy && styles.actionDisabled]}
                disabled={busy}
                onPress={end}
                accessibilityRole="button"
                accessibilityLabel="End session"
              >
                <Feather name="square" size={STUDY_ICON_SIZE} color={colors.danger} />
                <Text style={[styles.actionText, styles.actionDangerText]}>End</Text>
              </Pressable>
            </>
          ) : null}

          {/* ---------------- recap ---------------- */}
          {phase === "recap" && result ? (
            <>
              <Text style={styles.heroEmoji}>🎉</Text>
              <View style={styles.recapHeader}>
                <Text style={styles.recapTitle}>Session complete</Text>
              </View>

              <View style={styles.dialWrap}>
                <FocusDial progress={dialProgress} color={bandColor}>
                  <Text style={styles.dialScore}>{result.focusScore ?? "—"}</Text>
                  <Text style={styles.dialCaption}>focus</Text>
                </FocusDial>
              </View>

              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: bandColor }]} />
                <Text style={styles.statusText}>{scoreBand.label}</Text>
              </View>

              {/* The payoff, shaped as rewards rather than more statistics. */}
              <View style={styles.rewardRow}>
                <View style={styles.rewardCard}>
                  <Text style={styles.rewardEmoji}>⭐</Text>
                  <Text style={styles.rewardValue}>+{result.focusPoints}</Text>
                  <Text style={styles.rewardLabel}>XP</Text>
                </View>
                <View style={styles.rewardCard}>
                  <Text style={styles.rewardEmoji}>🔥</Text>
                  <Text style={styles.rewardValue}>{streakDays}</Text>
                  <Text style={styles.rewardLabel}>day streak</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Row first icon="clock" label="Time">
                  <Text style={styles.rowValue}>{short(result.totalSec)}</Text>
                </Row>
                <Row icon="target" label="Focused time">
                  <Text style={styles.rowValue}>
                    {result.focusWeightedMinutes == null
                      ? "—"
                      : short(result.focusWeightedMinutes * 60)}
                  </Text>
                </Row>
                <Row icon="log-out" label="Distractions">
                  <Text
                    style={[
                      styles.rowValue,
                      result.interruptionCount > 0 ? { color: colors.warning } : null,
                    ]}
                  >
                    {result.interruptionCount}
                  </Text>
                </Row>
              </View>

              <FocusTrace values={trace} />

              <Pressable
                style={styles.action}
                onPress={() => goTo("rating")}
                accessibilityRole="button"
                accessibilityLabel="Rate this session"
              >
                <Feather name="star" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>Rate it</Text>
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={reset}
                accessibilityRole="button"
                accessibilityLabel="Skip rating"
              >
                <Text style={styles.linkText}>Skip</Text>
              </Pressable>
            </>
          ) : null}

          {/* ---------------- rating ---------------- */}
          {phase === "rating" ? (
            <>
              <View style={styles.ratingWrap}>
                <Text style={styles.heroEmoji}>🧠</Text>
                <Text style={styles.ratingQuestion}>How focused{"\n"}did you feel?</Text>

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
                        accessibilityLabel={`${value} out of 5`}
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

                <Text style={styles.ratingHint}>Tunes your score</Text>
              </View>

              <Pressable
                style={[styles.action, rating === null && styles.actionDisabled]}
                disabled={rating === null}
                onPress={reset}
                accessibilityRole="button"
                accessibilityLabel="Submit rating"
              >
                <Feather name="check" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>Submit</Text>
              </Pressable>
            </>
          ) : null}

          {/*
            The one claim that cannot be left implied. Small, and on every state,
            because a number that looks like a measurement will be read as one.
          */}
          <Text style={styles.ratingHint}>Focus is an estimate, not a measurement</Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Study;
