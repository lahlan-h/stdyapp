import { useEffect, useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useTabBarClearance,
  STUDY_FOOTER_ROOM,
  STUDY_ICON_SIZE,
} from "@theme";
import { useFocusSession } from "@data";

import DurationPicker from "@components/DurationPicker";
import FocusDial from "@components/FocusDial";
import FocusTrace from "@components/FocusTrace";
import RatingSheet from "@components/RatingSheet";

/**
 * The focus session screen: set up, run, recap.
 *
 * WRITTEN SHORT ON PURPOSE. The audience already knows how an app works, so
 * every sentence of explanation here is one they will not read. The controls
 * carry the meaning - a dial, four chips, one button - and the only prose that
 * survives is the line saying the score is an estimate, because that claim is
 * the one we may not leave implied.
 *
 * THE DIAL IS FOR THE LIVE SESSION ONLY. Once the session ends it goes: a
 * countdown with nothing left to count is decoration, and the recap is about
 * numbers you compare, not one you watch. Each of those gets its own card so
 * the eye can land on a single figure without reading the rest.
 *
 * Every colour is a palette token; the screen holds no hex of its own.
 */

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
    plannedSec,
    setPlannedSec,
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
    reset,
  } = useFocusSession();

  const [sheetOpen, setSheetOpen] = useState(false);

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
  const dialProgress = plannedSec
    ? elapsedSec / plannedSec
    : (liveFocus ?? 0) / 100;

  /**
   * The sheet comes up on its own when the recap lands, because a rating asked
   * for is a rating given and one hidden behind a button is not. Only once:
   * flicking it away must not have it spring straight back, so this keys on
   * the phase rather than on whether a rating exists.
   */
  useEffect(() => {
    if (phase === "recap") setSheetOpen(true);
    else setSheetOpen(false);
  }, [phase]);

  const finish = () => {
    setSheetOpen(false);
    reset();
  };

  /**
   * Opens the composer AND clears the session.
   *
   * Without the reset, coming back from the composer landed on the same recap
   * with no obvious way forward - the session was over but the screen still
   * behaved as though it were not.
   */
  const share = () => {
    setSheetOpen(false);
    reset();
    router.push("/new-post");
  };

  const Metric = ({
    icon,
    tint,
    label,
    onPress,
    accessibilityLabel,
    children,
  }: {
    icon: keyof typeof Feather.glyphMap;
    tint: string;
    label: string;
    onPress?: () => void;
    accessibilityLabel?: string;
    children: React.ReactNode;
  }) => (
    // Pressable only when it does something - a card that highlights under the
    // finger and then does nothing is worse than a plain one.
    <Pressable
      style={styles.metricCard}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.metricIcon}>
        <Feather name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      {children}
    </Pressable>
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
              {/*
                The picker lives INSIDE the dial, so the circle the user sets
                the length in is the same circle that then counts it down -
                one object changing state rather than two controls swapping
                places.
              */}
              <View style={styles.dialWrap}>
                <FocusDial progress={0} color={colors.primary} wideContent>
                  <DurationPicker compact seconds={plannedSec} onChange={setPlannedSec} />
                </FocusDial>
              </View>

              <Text style={styles.plannedCaption}>
                {plannedSec ? `${clock(plannedSec)} planned` : "No time limit"}
              </Text>

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

              <Text style={styles.helpText}>
                Focus is an estimate, not a measurement.
              </Text>
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

          {/* ---------------- recap: no dial, cards only ---------------- */}
          {phase === "recap" && result ? (
            <>
              <Text style={styles.heroEmoji}>🎉</Text>
              <View style={styles.recapHeader}>
                <Text style={styles.recapTitle}>Session complete</Text>
                <Text style={styles.recapSubtitle}>Nice work, keep it up.</Text>
              </View>

              <Metric icon="clock" tint={colors.success} label="Total time">
                <Text style={styles.metricValue}>{short(result.totalSec)}</Text>
              </Metric>

              <Metric
                icon="target"
                tint={colors.warning}
                label="Focus estimate"
                onPress={() => setSheetOpen(true)}
                accessibilityLabel="Rate this session"
              >
                <View
                  style={[styles.bandPill, { backgroundColor: colors.successTint }]}
                >
                  <View style={[styles.bandDot, { backgroundColor: bandColor }]} />
                  <Text style={[styles.bandPillText, { color: bandColor }]}>
                    {scoreBand.label}
                  </Text>
                </View>
                <Text style={[styles.metricValue, { color: bandColor }]}>
                  {result.focusScore ?? "—"}
                </Text>
              </Metric>

              <Metric icon="zap-off" tint={colors.danger} label="Distractions">
                <Text style={styles.metricValue}>
                  {result.interruptionCount}
                  {result.awaySeconds > 0 ? ` · ${short(result.awaySeconds)}` : ""}
                </Text>
              </Metric>

              <FocusTrace values={trace} totalSec={result.totalSec} />

              <View style={styles.rewardRow}>
                <View style={styles.rewardCard}>
                  <View style={styles.rewardTop}>
                    <Text style={styles.rewardEmoji}>⭐</Text>
                    <Text style={[styles.rewardValue, { color: colors.primary }]}>
                      +{result.focusPoints} XP
                    </Text>
                  </View>
                  <Text style={styles.rewardCaption}>Banked to your total.</Text>
                </View>

                <View style={styles.rewardCard}>
                  <View style={styles.rewardTop}>
                    <Text style={styles.rewardEmoji}>🔥</Text>
                    <Text style={[styles.rewardValue, { color: colors.warning }]}>
                      {streakDays} {streakDays === 1 ? "day" : "days"}
                    </Text>
                  </View>
                  <Text style={styles.rewardCaption}>Keep the streak alive.</Text>
                </View>
              </View>

              {/*
                Opens the composer. The post is NOT linked to this session yet -
                useCreatePost deliberately does not send a sessionId - so that
                connection is still the posts feature's to make.
              */}
              <Pressable
                style={styles.action}
                onPress={share}
                accessibilityRole="button"
                accessibilityLabel="Share to feed"
              >
                <Feather name="share-2" size={STUDY_ICON_SIZE} color={colors.surface} />
                <Text style={styles.actionText}>Share to feed</Text>
              </Pressable>

              {/*
                The way back to the start screen, and the only one - so it is a
                button, not a faint link. Both actions end the recap, because a
                finished session the user cannot leave is a dead end.
              */}
              <Pressable
                style={styles.actionSecondary}
                onPress={finish}
                accessibilityRole="button"
                accessibilityLabel="Save privately and start again"
              >
                <Feather name="check" size={STUDY_ICON_SIZE} color={colors.text} />
                <Text style={styles.actionSecondaryText}>Save privately</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>

        {/*
          Over the recap rather than replacing it, so the numbers stay visible
          while the question is answered - and a flick down is a cheap way out,
          which matters because a rating someone felt cornered into is worse
          data than no rating.
        */}
        <RatingSheet
          visible={sheetOpen}
          value={rating}
          onRate={rate}
          onClose={() => setSheetOpen(false)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Study;
