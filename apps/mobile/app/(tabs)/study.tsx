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
 * Four states in one route rather than four routes, because they are one task
 * and the user should never be able to land mid-session from a deep link or a
 * back gesture with no session running.
 *
 * Every colour comes from the palette - the screen holds no hex of its own - so
 * when the wider visual language lands this restyles from study.styles.ts.
 *
 * The score is an ESTIMATE from phone sensors and the copy says so. It is not a
 * measurement of attention and must not be presented as one.
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

const humanDuration = (totalSec: number) => {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};

/**
 * Bands, not a gradient. The estimate is not precise enough to justify one, and
 * a word is what a glance actually reads - "Deep focus" lands where "84" needs
 * interpreting.
 */
const band = (score: number | null) => {
  if (score === null) return { label: "No reading", key: "none" as const };
  if (score >= 80) return { label: "Deep focus", key: "good" as const };
  if (score >= 60) return { label: "Solid focus", key: "good" as const };
  if (score >= 40) return { label: "Patchy focus", key: "mid" as const };
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
    error,
    busy,
    start,
    end,
    rate,
    goTo,
    reset,
  } = useFocusSession();

  /** Kept separate from plannedMinutes so a half-typed "1" is not a 1-minute plan. */
  const [customText, setCustomText] = useState("");

  const running = phase === "running";
  const score = phase === "running" ? liveFocus : (result?.focusScore ?? null);
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
   * While running WITH a plan the ring is a clock - how much of the planned
   * time has gone. Without a plan there is no end to fill towards, so it shows
   * the focus reading instead, which is the only thing that can meaningfully
   * fill a ring in an open-ended session.
   */
  const dialProgress =
    phase === "running"
      ? plannedMinutes
        ? elapsedSec / (plannedMinutes * 60)
        : (liveFocus ?? 0) / 100
      : (score ?? 0) / 100;

  const applyCustom = (text: string) => {
    setCustomText(text.replace(/[^0-9]/g, ""));
    const value = parseInt(text.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(value) && value >= 1 && value <= MAX_PLANNED_MINUTES) {
      setPlannedMinutes(value);
    }
  };

  const choosePreset = (minutes: number | null) => {
    setPlannedMinutes(minutes);
    setCustomText("");
  };

  const StatRow = ({
    icon,
    label,
    value,
    tint,
    first,
  }: {
    icon: keyof typeof Feather.glyphMap;
    label: string;
    value: string;
    tint?: string;
    first?: boolean;
  }) => (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={15} color={tint ?? colors.textMuted} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tint ? { color: tint } : null]}>{value}</Text>
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
              <View style={styles.header}>
                <Text style={styles.screenTitle}>Focus</Text>
                <Text style={styles.screenSubtitle}>
                  Set a length, or just start and stop when you are done.
                </Text>
              </View>

              <View style={styles.dialWrap}>
                <FocusDial progress={0} color={colors.primary}>
                  <Text style={styles.dialValue}>
                    {plannedMinutes ? clock(plannedMinutes * 60) : "—"}
                  </Text>
                  <Text style={styles.dialCaption}>
                    {plannedMinutes ? "planned" : "open ended"}
                  </Text>
                </FocusDial>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>How long?</Text>
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
                          {minutes}m
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.chip, plannedMinutes === null && styles.chipSelected]}
                    onPress={() => choosePreset(null)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: plannedMinutes === null }}
                    accessibilityLabel="No set time"
                  >
                    <Text
                      style={[
                        styles.chipText,
                        plannedMinutes === null && styles.chipTextSelected,
                      ]}
                    >
                      Open
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
                    placeholder="Or type a length"
                    placeholderTextColor={colors.textMuted}
                    accessibilityLabel="Custom session length in minutes"
                  />
                  <Text style={styles.customUnit}>minutes</Text>
                </View>

                <Text style={styles.helpText}>
                  Finishing what you planned counts towards your score. Stopping
                  early lowers it; running over does not raise it. An open session
                  is judged on focus alone.
                </Text>
              </View>

              <Pressable
                style={[styles.action, busy && styles.actionDisabled]}
                disabled={busy}
                onPress={start}
                accessibilityRole="button"
                accessibilityLabel="Start session"
              >
                <Feather name="play" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>
                  {busy ? "Starting…" : "Start session"}
                </Text>
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
                    {remainingSec === null ? "elapsed" : "remaining"}
                  </Text>
                </FocusDial>
              </View>

              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: bandColor }]} />
                <Text style={styles.statusText}>
                  {liveFocus === null ? "Measuring…" : scoreBand.label}
                </Text>
              </View>

              <View style={styles.card}>
                <StatRow
                  first
                  icon="clock"
                  label="Elapsed"
                  value={humanDuration(elapsedSec)}
                />
                <StatRow
                  icon="log-out"
                  label="Time away"
                  value={awaySec > 0 ? humanDuration(awaySec) : "None"}
                  tint={awaySec > 0 ? colors.warning : undefined}
                />
                <Text style={styles.helpText}>
                  Leaving the app is recorded and counts against the estimate.
                </Text>
              </View>

              <Pressable
                style={[styles.action, styles.actionDanger, busy && styles.actionDisabled]}
                disabled={busy}
                onPress={end}
                accessibilityRole="button"
                accessibilityLabel="End session"
              >
                <Feather name="square" size={STUDY_ICON_SIZE} color={colors.danger} />
                <Text style={[styles.actionText, styles.actionDangerText]}>
                  {busy ? "Finishing…" : "End session"}
                </Text>
              </Pressable>
            </>
          ) : null}

          {/* ---------------- recap ---------------- */}
          {phase === "recap" && result ? (
            <>
              <View style={styles.recapHeader}>
                <Text style={styles.recapTitle}>Session complete</Text>
                <Text style={styles.recapSubtitle}>Nice work, keep it up.</Text>
              </View>

              <View style={styles.dialWrap}>
                <FocusDial progress={dialProgress} color={bandColor}>
                  <Text style={styles.dialScore}>{result.focusScore ?? "—"}</Text>
                  <Text style={styles.dialCaption}>focus estimate</Text>
                </FocusDial>
              </View>

              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: bandColor }]} />
                <Text style={styles.statusText}>{scoreBand.label}</Text>
              </View>

              <View style={styles.card}>
                <StatRow
                  first
                  icon="clock"
                  label="Total time"
                  value={humanDuration(result.totalSec)}
                />
                <StatRow
                  icon="target"
                  label="Focus-weighted"
                  value={
                    result.focusWeightedMinutes == null
                      ? "—"
                      : `${result.focusWeightedMinutes.toFixed(1)}m`
                  }
                />
                <StatRow
                  icon="log-out"
                  label="Distractions"
                  value={
                    result.interruptionCount === 0
                      ? "None"
                      : `${result.interruptionCount} · ${humanDuration(result.awaySeconds)}`
                  }
                  tint={result.interruptionCount > 0 ? colors.warning : undefined}
                />
                {/* The other feature's number, shown beside ours and never
                    merged into it - they answer different questions. */}
                <StatRow
                  icon="award"
                  label="Points earned"
                  value={`+${result.focusPoints}`}
                />
              </View>

              <FocusTrace values={trace} />

              <Pressable
                style={styles.action}
                onPress={() => goTo("rating")}
                accessibilityRole="button"
                accessibilityLabel="Rate this session"
              >
                <Feather name="edit-3" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>How focused did you feel?</Text>
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={reset}
                accessibilityRole="button"
                accessibilityLabel="Skip rating and start a new session"
              >
                <Text style={styles.linkText}>Skip for now</Text>
              </Pressable>
            </>
          ) : null}

          {/* ---------------- rating ---------------- */}
          {phase === "rating" ? (
            <>
              <View style={styles.ratingWrap}>
                <View style={styles.ratingIcon}>
                  <Feather name="activity" size={26} color={colors.primary} />
                </View>
                <Text style={styles.ratingQuestion}>How focused{"\n"}did you feel?</Text>
                <Text style={styles.ratingHint}>Your rating</Text>

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
              </View>

              <Text style={styles.ratingHint}>
                Helps stdy learn your baseline. It is the only thing that can tell
                us whether the estimate is any good.
              </Text>

              <Pressable
                style={[styles.action, rating === null && styles.actionDisabled]}
                disabled={rating === null}
                onPress={reset}
                accessibilityRole="button"
                accessibilityLabel="Submit rating"
              >
                <Feather name="check" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>Done</Text>
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={() => goTo("recap")}
                accessibilityRole="button"
                accessibilityLabel="Back to the recap"
              >
                <Text style={styles.linkText}>Back to recap</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Study;
