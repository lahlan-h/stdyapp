import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useTabBarClearance,
  STUDY_FOOTER_ROOM,
  STUDY_ICON_SIZE,
  TASK_ICON_SIZE,
} from "@theme";
import { useFocusSession, consumeStudyRequest, MAX_JOIN_CODE_LENGTH } from "@data";

import FocusDial from "@components/FocusDial";
import FocusTrace from "@components/FocusTrace";
import RatingSheet from "@components/RatingSheet";
import TaskChecklist from "@components/TaskChecklist";
import RoutineList from "@components/RoutineList";
import { focusBand, focusBandColor } from "@components/focusBand";
import GroupList from "@components/GroupList";
import WeeklyStudyCard from "@components/WeeklyStudyCard";
import AdvancedAnalyticsRow from "@components/AdvancedAnalyticsRow";
import BeginCard from "@components/BeginCard";
import RoomParticipants from "@components/RoomParticipants";
import { confirmGroupAction } from "@components/confirmGroup";

/** The three views under the Study tab. */
type StudyView = "sessions" | "routines" | "groups";

const VIEWS: { key: StudyView; label: string }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "routines", label: "Routines" },
  { key: "groups", label: "Groups" },
];

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
 *
 * THREE VIEWS, ONE SESSION. A switch at the top flips between Sessions,
 * Routines and Groups, but useFocusSession stays mounted in this screen
 * whichever is showing - so a running session keeps its timer, samples and
 * away-tracking while the user checks a routine or a group. Only the rendered
 * content swaps.
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

const Study = () => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const tabBarClearance = useTabBarClearance();

  const {
    phase,
    elapsedSec,
    remainingSec,
    plannedSec,
    liveFocus,
    awaySec,
    phoneDownSec,
    isPhoneDown,
    trace,
    liveTimeline,
    result,
    rating,
    streakDays,
    tasks,
    addTask,
    toggleTask,
    removeTask,
    selectedGroup,
    setSelectedGroup,
    activeGroup,
    sessionId,
    ending,
    privateGroupId,
    error,
    busy,
    start,
    join,
    end,
    rate,
    reset,
  } = useFocusSession();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<StudyView>("sessions");
  const [inviteDraft, setInviteDraft] = useState("");

  /**
   * Takes a request a group screen left on the way here - see studyRequest.ts.
   * On focus, because that is how the group screen arrives: it navigates to
   * this already-mounted tab rather than mounting a new one.
   */
  useFocusEffect(
    useCallback(() => {
      const request = consumeStudyRequest();
      if (!request) return;
      setView("sessions");
      if (request.kind === "group") {
        setSelectedGroup({ id: request.groupId, name: request.groupName });
      } else if (phase === "running") {
        // One session at a time: joining another means leaving this one.
        confirmGroupAction(
          "Switch sessions?",
          `Your current session ends and is saved, and you join the one in ${request.groupName}.`,
          "Switch",
          () => join(request.inviteCode, request.groupName, { switching: true }),
          { destructive: false },
        );
      } else {
        join(request.inviteCode, request.groupName);
      }
    }, [join, setSelectedGroup, phase]),
  );

  const submitInvite = () => {
    if (!inviteDraft.trim()) return;
    join(inviteDraft);
    setInviteDraft("");
  };

  /** "Invite copied", shown under the chip for a moment after a web copy. */
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = (text: string) => {
    setInviteNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setInviteNotice(null), 2500);
  };

  /**
   * Shares the invite - the system share sheet on phones.
   *
   * The web needs its own path. react-native-web's Share is the browser's
   * navigator.share, which most DESKTOP browsers lack, and there it rejects
   * without a word - the chip looked dead. So the web uses the browser's sheet
   * where it exists (most phone browsers) and otherwise copies the invite and
   * says so. If even the clipboard is refused, the code is shown to copy by
   * hand: the chip always does something.
   */
  const shareInvite = async () => {
    if (!activeGroup?.inviteCode) return;
    const code = activeGroup.inviteCode;
    const message = `Study with me in ${activeGroup.name} on stdy - join with code ${code}`;

    if (Platform.OS !== "web") {
      void Share.share({ message });
      return;
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: message });
        return;
      } catch (err) {
        // Dismissing the sheet is a choice, not a failure - no fallback then.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      showNotice("Invite copied - paste it to a friend");
    } catch {
      showNotice(`Your invite code is ${code}`);
    }
  };

  const running = phase === "running";
  const score = running ? liveFocus : (result?.focusScore ?? null);
  // Shared with the session history, so a score reads the same in both.
  const scoreBand = focusBand(score);
  const bandColor = focusBandColor(scoreBand.key, colors);

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

  /**
   * A session that ends while Routines or Groups is showing brings Sessions back, so the
   * recap and its rating sheet are not opened behind another list.
   */
  useEffect(() => {
    if (phase === "recap") setView("sessions");
  }, [phase]);

  const showingSessions = view === "sessions";

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
    // Read before reset() clears it, so the composer opens already linked.
    const finished = sessionId;
    setSheetOpen(false);
    reset();
    router.push(
      finished ? { pathname: "/new-post", params: { sessionId: finished } } : "/new-post",
    );
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
          <View style={styles.viewSwitch} accessibilityRole="tablist">
            {VIEWS.map(({ key, label }) => {
              const selected = key === view;
              const live = key === "sessions" && running && !selected;
              return (
                <Pressable
                  key={key}
                  style={[styles.viewSwitchItem, selected && styles.viewSwitchItemSelected]}
                  onPress={() => setView(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={live ? `${label}, session running` : label}
                >
                  {live ? <View style={styles.viewSwitchDot} /> : null}
                  <Text
                    style={[styles.viewSwitchLabel, selected && styles.viewSwitchLabelSelected]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {view === "routines" ? <RoutineList /> : null}
          {view === "groups" ? <GroupList /> : null}

          {showingSessions && error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              {/* A private group's session: the way in is the group's join code. */}
              {privateGroupId ? (
                <Pressable
                  style={styles.linkButton}
                  onPress={() =>
                    router.push({ pathname: "/group/[id]", params: { id: privateGroupId } })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>Open the group to enter its code</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* ---------------- set up ---------------- */}
          {showingSessions && phase === "idle" ? (
            <>
              <WeeklyStudyCard />
              <AdvancedAnalyticsRow />

              {/* Chosen from a group's screen; clearing it makes the next
                  session solo again. Above Begin, because it changes what
                  Begin starts. */}
              {selectedGroup ? (
                <View style={styles.groupChip}>
                  <Feather name="users" size={TASK_ICON_SIZE} color={colors.primary} />
                  <Text style={styles.groupChipText} numberOfLines={1}>
                    Studying with {selectedGroup.name}
                  </Text>
                  <Pressable
                    style={styles.groupChipClear}
                    onPress={() => setSelectedGroup(null)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Study solo instead"
                  >
                    <Feather name="x" size={TASK_ICON_SIZE} color={colors.textMuted} />
                  </Pressable>
                </View>
              ) : null}

              {/* No length to pick and no checklist to fill first: a session
                  starts the moment a mode is chosen. Tasks can still be added
                  once it is running. */}
              <BeginCard busy={busy} onStartNormal={start} />

              <Text style={styles.helpText}>
                Focus is an estimate, not a measurement.
              </Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Join a session</Text>
                <View style={styles.taskAddRow}>
                  <TextInput
                    style={styles.taskInput}
                    value={inviteDraft}
                    onChangeText={setInviteDraft}
                    onSubmitEditing={submitInvite}
                    placeholder="Invite code"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="go"
                    maxLength={MAX_JOIN_CODE_LENGTH}
                    accessibilityLabel="Session invite code"
                  />
                  <Pressable
                    style={[
                      styles.taskAddButton,
                      (busy || !inviteDraft.trim()) && styles.actionDisabled,
                    ]}
                    disabled={busy || !inviteDraft.trim()}
                    onPress={submitInvite}
                    accessibilityRole="button"
                    accessibilityLabel="Join session"
                  >
                    <Feather name="log-in" size={STUDY_ICON_SIZE} color={colors.surface} />
                  </Pressable>
                </View>
                <Text style={styles.emptyText}>
                  Joining a public group's session adds you to the group. Or
                  open one of your groups to see who is studying now.
                </Text>
              </View>

              {/* Past sessions live behind the profile's Session history
                  button; the weekly card is this tab's look back. */}
            </>
          ) : null}

          {/* ---------------- running ---------------- */}
          {showingSessions && running ? (
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
                  {ending === "retrying"
                    ? "Ending… reconnecting"
                    : ending === "failed"
                      ? "Not ended yet"
                      : liveFocus === null
                        ? "Reading…"
                        : scoreBand.label}
                </Text>
              </View>

              {/* The code is what lets someone else join; tapping shares it. */}
              {activeGroup ? (
                <Pressable
                  style={styles.groupChip}
                  onPress={shareInvite}
                  disabled={!activeGroup.inviteCode}
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeGroup.inviteCode
                      ? `Studying in ${activeGroup.name}. Share invite code ${activeGroup.inviteCode}`
                      : `Studying in ${activeGroup.name}`
                  }
                >
                  <Feather name="users" size={TASK_ICON_SIZE} color={colors.primary} />
                  <Text style={styles.groupChipText} numberOfLines={1}>
                    {activeGroup.name}
                  </Text>
                  {activeGroup.inviteCode ? (
                    <>
                      <Text style={styles.groupChipCode}>{activeGroup.inviteCode}</Text>
                      <View style={styles.groupChipClear}>
                        <Feather name="share" size={TASK_ICON_SIZE} color={colors.textMuted} />
                      </View>
                    </>
                  ) : null}
                </Pressable>
              ) : null}

              {/* Web only: says what the chip just did when there was no sheet. */}
              {inviteNotice ? (
                <Text style={[styles.helpText, styles.centeredText]} accessibilityLiveRegion="polite">
                  {inviteNotice}
                </Text>
              ) : null}

              {/* Shown only when there is something to say. */}
              {awaySec > 0 ? (
                <View style={styles.warnChip}>
                  <Feather name="log-out" size={13} color={colors.danger} />
                  <Text style={styles.warnChipText}>{short(awaySec)} away</Text>
                </View>
              ) : null}

              {phoneDownSec > 0 ? (
                <View style={styles.calmChip}>
                  <Feather name="smartphone" size={13} color={colors.success} />
                  <Text style={styles.calmChipText}>{short(phoneDownSec)} phone down</Text>
                </View>
              ) : null}

              {/* Live, so leaving the app or fidgeting shows up while it happens. */}
              {liveTimeline ? <FocusTrace timeline={liveTimeline} live /> : null}

              {/* Group sessions only: a solo session is a room of one. */}
              {activeGroup && sessionId ? <RoomParticipants sessionId={sessionId} /> : null}

              <TaskChecklist
                tasks={tasks}
                onAdd={addTask}
                onToggle={toggleTask}
                onRemoveTask={removeTask}
              />

              <Pressable
                style={[styles.action, styles.actionDanger, busy && styles.actionDisabled]}
                disabled={busy}
                onPress={end}
                accessibilityRole="button"
                accessibilityLabel={ending === "failed" ? "Try ending again" : "End session"}
              >
                <Feather
                  name={ending === "failed" ? "refresh-cw" : "square"}
                  size={STUDY_ICON_SIZE}
                  color={colors.danger}
                />
                <Text style={[styles.actionText, styles.actionDangerText]}>
                  {ending === "retrying" ? "Ending…" : ending === "failed" ? "Try again" : "End"}
                </Text>
              </Pressable>

              {/* After the retries run out: the clock is already stopped, and
                  the session is closed properly the next time they study. */}
              {ending === "failed" ? (
                <Pressable
                  style={styles.actionSecondary}
                  onPress={reset}
                  accessibilityRole="button"
                  accessibilityLabel="Leave it for now"
                >
                  <Text style={styles.actionSecondaryText}>Leave it for now</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {/* ---------------- recap: no dial, cards only ---------------- */}
          {showingSessions && phase === "recap" && result ? (
            <>
              {/*
                A vector mark, not an emoji: emoji render differently on every
                platform and cannot take a palette colour, so they drift from
                the rest of the icon set.
              */}
              <View style={styles.heroBadge}>
                <Feather name="award" size={28} color={colors.success} />
              </View>
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

              {result.tasksTotal > 0 ? (
                <Metric
                  icon="check-square"
                  tint={colors.primary}
                  label="Tasks done"
                >
                  <Text
                    style={[
                      styles.metricValue,
                      result.tasksCompleted === result.tasksTotal
                        ? { color: colors.success }
                        : null,
                    ]}
                  >
                    {result.tasksCompleted}/{result.tasksTotal}
                  </Text>
                </Metric>
              ) : null}

              <Metric icon="zap-off" tint={colors.danger} label="Distractions">
                <Text style={styles.metricValue}>
                  {result.interruptionCount}
                  {result.awaySeconds > 0 ? ` · ${short(result.awaySeconds)}` : ""}
                </Text>
              </Metric>

              {trace ? <FocusTrace timeline={trace} /> : null}

              <View style={styles.rewardRow}>
                <View style={styles.rewardCard}>
                  <View style={styles.rewardTop}>
                    <Feather name="star" size={16} color={colors.primary} />
                    <Text style={[styles.rewardValue, { color: colors.primary }]}>
                      +{result.focusPoints} XP
                    </Text>
                  </View>
                  <Text style={styles.rewardCaption}>Banked to your total.</Text>
                </View>

                <View style={styles.rewardCard}>
                  <View style={styles.rewardTop}>
                    <Feather name="trending-up" size={16} color={colors.warning} />
                    <Text style={[styles.rewardValue, { color: colors.warning }]}>
                      {streakDays} {streakDays === 1 ? "day" : "days"}
                    </Text>
                  </View>
                  <Text style={styles.rewardCaption}>Keep the streak alive.</Text>
                </View>
              </View>

              {/* Opens the composer with this session already linked. */}
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
                accessibilityLabel="Done"
              >
                <Feather name="check" size={STUDY_ICON_SIZE} color={colors.text} />
                <Text style={styles.actionSecondaryText}>Done</Text>
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

      {/* Face-down mode: nobody can see the screen, so it goes black. */}
      {running && isPhoneDown ? (
        <View style={styles.phoneDownOverlay} accessibilityLabel="Phone down, still focusing">
          <Text style={styles.phoneDownText}>Phone down · focusing</Text>
          <Text style={styles.phoneDownHint}>Pick it up to see your session</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
};

export default Study;
