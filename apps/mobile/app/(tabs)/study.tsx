import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
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
  haptics,
} from "@theme";
import { useFocusSession, consumeStudyRequest } from "@data";

import FocusDial from "@components/FocusDial";
import FocusTrace from "@components/FocusTrace";
import TaskChecklist from "@components/TaskChecklist";
import RoutineList from "@components/RoutineList";
import { focusBand, focusBandColor } from "@components/focusBand";
import GroupList from "@components/GroupList";
import { formatClock } from "@components/sessionFormat";
import BeginCard from "@components/BeginCard";
import RoomParticipants from "@components/RoomParticipants";
import JoinOrCreateGroupCard from "@components/JoinOrCreateGroupCard";
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
 * THE DIAL IS FOR THE LIVE SESSION ONLY. A finished session is summed up
 * where it is posted, and the week is on the analytics page.
 *
 * Every colour is a palette token; the screen holds no hex of its own.
 *
 * THREE VIEWS, ONE SESSION. A switch at the top flips between Sessions,
 * Routines and Groups, and the session itself lives above the tabs in
 * FocusSessionProvider - so a running session keeps its timer, samples and
 * away-tracking while the user checks a routine or another tab. Only the
 * rendered content swaps.
 *
 * Groups is set-up - joining a group, making one - so it leaves the switch
 * while a session runs: there is nothing in it to do mid-session but get
 * distracted.
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
    setPlannedSec,
    liveFocus,
    awaySec,
    phoneDownSec,
    isPhoneDown,
    isPaused,
    breakRemainingSec,
    breaksLeft,
    breakTimedOut,
    pause,
    resume,
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
    const message = `Study with me in ${activeGroup.name} on stdy - type ${code} on the Study tab to join.`;

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

  /**
   * The views the switch offers, and the one on screen. Groups drops out while
   * a session runs (see above), and a Groups view still open as a session
   * starts falls back to the session itself.
   */
  const views = running ? VIEWS.filter(({ key }) => key !== "groups") : VIEWS;
  const shownView: StudyView = running && view === "groups" ? "sessions" : view;

  /**
   * A break, from the button beside End. The last one asks first: after it
   * there are no more, and time away from the app counts against the focus
   * estimate again - worth knowing before spending it.
   */
  const takeBreak = () => {
    if (breaksLeft === 1) {
      haptics.warning();
      Alert.alert(
        "Last break",
        "This is your last break this session. After it you can't pause again, so any time away from the app will count against your focus score.",
        [
          { text: "Not yet", style: "cancel" },
          {
            text: "Take break",
            onPress: () => {
              haptics.tap();
              pause();
            },
          },
        ],
      );
      return;
    }
    haptics.tap();
    pause();
  };

  const endBreak = () => {
    haptics.thud();
    resume();
  };

  // A break that ran its five minutes ended on its own - say so in the hand.
  useEffect(() => {
    if (breakTimedOut) haptics.warning();
  }, [breakTimedOut]);
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

  const showingSessions = shownView === "sessions";

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
            {views.map(({ key, label }) => {
              const selected = key === shownView;
              const live = key === "sessions" && running && !selected;
              return (
                <Pressable
                  key={key}
                  style={[styles.viewSwitchItem, selected && styles.viewSwitchItemSelected]}
                  onPress={() => {
                    if (!selected) haptics.tick();
                    setView(key);
                  }}
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

          {shownView === "routines" ? <RoutineList /> : null}
          {shownView === "groups" ? (
            <GroupList onJoinedSession={() => setView("sessions")} />
          ) : null}

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
              {/* Length, who with, then slide to lock in. A group chosen on
                  a group's screen arrives here already picked. Tasks are
                  added once the session runs. */}
              <BeginCard
                busy={busy}
                plannedSec={plannedSec}
                onChangePlannedSec={setPlannedSec}
                group={selectedGroup}
                onChangeGroup={setSelectedGroup}
                onStart={start}
              />

              <Text style={styles.helpText}>
                Focus is an estimate, not a measurement.
              </Text>

              {/* Into a group by its code, or a new one - before a session
                  only. Joining someone's live session is on the group's
                  own page, under Studying now. */}
              <JoinOrCreateGroupCard />

              {/* Looking back - past sessions and the week's analytics -
                  lives behind the profile's History and Analytics buttons. */}
            </>
          ) : null}

          {/* ---------------- running ---------------- */}
          {showingSessions && running ? (
            <>
              <View style={styles.dialWrap}>
                {/* On a break the dial counts the break down instead, in a
                    quiet colour: the session clock is stopped. */}
                <FocusDial
                  progress={isPaused ? breakRemainingSec / 300 : dialProgress}
                  color={isPaused ? colors.textMuted : bandColor}
                >
                  <Text style={styles.dialValue}>
                    {formatClock(isPaused ? breakRemainingSec : (remainingSec ?? elapsedSec))}
                  </Text>
                  <Text style={styles.dialCaption}>
                    {isPaused ? "break left" : remainingSec === null ? "elapsed" : "left"}
                  </Text>
                </FocusDial>
              </View>

              <View style={styles.statusPill}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isPaused ? colors.textMuted : bandColor },
                  ]}
                />
                <Text style={styles.statusText}>
                  {ending === "retrying"
                    ? "Ending… reconnecting"
                    : ending === "failed"
                      ? "Not ended yet"
                      : isPaused
                        ? "On a break"
                        : liveFocus === null
                        ? "Reading…"
                        : scoreBand.label}
                </Text>
              </View>

              {/* The session's two controls, right under the clock they act
                  on: a break - three a session, five minutes each, greyed out
                  once used - and End. While on a break, Resume takes the
                  lead. */}
              <View style={styles.controlRow}>
                <Pressable
                  style={[
                    isPaused ? styles.action : styles.actionSecondary,
                    styles.controlButton,
                    (busy || (!isPaused && breaksLeft === 0)) && styles.actionDisabled,
                  ]}
                  disabled={busy || (!isPaused && breaksLeft === 0)}
                  onPress={isPaused ? endBreak : takeBreak}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isPaused
                      ? "Resume session"
                      : breaksLeft === 0
                        ? "No breaks left"
                        : `Take a break, ${breaksLeft} left`
                  }
                >
                  <Feather
                    name={isPaused ? "play" : "pause"}
                    size={STUDY_ICON_SIZE}
                    color={isPaused ? colors.surface : colors.text}
                  />
                  <Text style={isPaused ? styles.actionText : styles.actionSecondaryText}>
                    {isPaused
                      ? "Resume"
                      : breaksLeft === 0
                        ? "No breaks left"
                        : `Break · ${breaksLeft} left`}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.action,
                    styles.actionDanger,
                    styles.controlButton,
                    busy && styles.actionDisabled,
                  ]}
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

              {/* Above everything that turns up mid-session. The notes, chips,
                  chart and room all arrive later, and while they sat above the
                  checklist each one pushed it down - once moving + out from
                  under a finger adding a task. */}
              <TaskChecklist
                tasks={tasks}
                onAdd={addTask}
                onToggle={toggleTask}
                onRemoveTask={removeTask}
              />

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

              {breakTimedOut && !isPaused ? (
                <Text style={[styles.helpText, styles.centeredText]} accessibilityLiveRegion="polite">
                  Break's over - back to it.
                </Text>
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
            </>
          ) : null}

        </ScrollView>

      </SafeAreaView>

      {/* Face-down mode: nobody can see the screen, so it goes black. */}
      {running && isPhoneDown && !isPaused ? (
        <View style={styles.phoneDownOverlay} accessibilityLabel="Phone down, still focusing">
          <Text style={styles.phoneDownText}>Phone down · focusing</Text>
          <Text style={styles.phoneDownHint}>Pick it up to see your session</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
};

export default Study;
