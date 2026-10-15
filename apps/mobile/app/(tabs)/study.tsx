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
import TaskChecklist from "@components/TaskChecklist";
import RoutineList from "@components/RoutineList";
import { focusBand, focusBandColor } from "@components/focusBand";
import GroupList from "@components/GroupList";
import { formatClock } from "@components/sessionFormat";
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
 * The focus session screen: set up and run. Ending a session opens the
 * composer rather than a recap here - see the effect on phase below.
 *
 * WRITTEN SHORT ON PURPOSE. The audience already knows how an app works, so
 * every sentence of explanation here is one they will not read. The controls
 * carry the meaning - a dial, four chips, one button - and the only prose that
 * survives is the line saying the score is an estimate, because that claim is
 * the one we may not leave implied.
 *
 * THE DIAL IS FOR THE LIVE SESSION ONLY. Setting up shows the week instead,
 * and a finished session is summed up where it is posted.
 *
 * Every colour is a palette token; the screen holds no hex of its own.
 *
 * THREE VIEWS, ONE SESSION. A switch at the top flips between Sessions,
 * Routines and Groups, and the session itself lives above the tabs in
 * FocusSessionProvider - so a running session keeps its timer, samples and
 * away-tracking while the user checks a routine, a group or another tab. Only
 * the rendered content swaps.
 */


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
    liveTimeline,
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
    reset,
  } = useFocusSession();

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
  const score = running ? liveFocus : null;
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
   * Ending a session goes straight to the composer, the way finishing a Hevy
   * workout goes straight to saving it: a session is wrapped up by posting it,
   * or discarding it there, so there is no recap screen in between. The focus
   * rating asked for at the end moved with it.
   *
   * Reset before navigating, so coming back - posted or discarded - lands on
   * Begin rather than on a session that is already over. The id is read
   * first, because reset() clears it.
   */
  useEffect(() => {
    if (phase !== "recap" || !sessionId) return;
    const finished = sessionId;
    reset();
    setView("sessions");
    router.push({ pathname: "/new-post", params: { sessionId: finished } });
  }, [phase, sessionId, reset]);

  const showingSessions = view === "sessions";

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
                    {formatClock(remainingSec ?? elapsedSec)}
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

        </ScrollView>

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
