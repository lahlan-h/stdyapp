import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  useTheme,
  useReportDialogStyles,
  REPORT_CLOSE_ICON_SIZE,
  REPORT_CHECK_ICON_SIZE,
  REPORT_STATE_ICON_SIZE,
  REPORT_STATE_FLAG_SIZE,
} from "@theme";
import {
  useReportPost,
  REPORT_REASONS,
  DETAILED_REASON,
  MAX_REPORT_DETAILS,
  type FeedPost,
  type ReportReason,
} from "@data";

/**
 * What each reason is called on screen.
 *
 * The wording lives HERE and not beside REPORT_REASONS in the data layer: those
 * seven strings are the API's vocabulary, and a SCREAMING_SNAKE enum is not copy
 * anybody should read. Keyed by the enum rather than parallel to it, so adding a
 * reason to the API is a type error here rather than a blank row.
 */
const REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam",
  HARASSMENT: "Harassment",
  HATE_SPEECH: "Hate speech",
  NUDITY: "Nudity",
  MISINFORMATION: "Misinformation",
  SELF_HARM: "Self-harm",
  OTHER: "Other",
};

/** Scrim in, dialog in, and both back out. Out is quicker than in, as always. */
const SCRIM_IN_MS = 180;
const DIALOG_IN_MS = 200;
const OUT_MS = 140;

/** How small the dialog starts before it settles. */
const ENTER_SCALE = 0.94;

/** Breathing room between the lifted dialog and the top of the keyboard. */
const KEYBOARD_GAP = 24;

/** Used when a keyboard event arrives without its own duration, as Android's do. */
const FALLBACK_KEYBOARD_MS = 250;

/**
 * Which face of the dialog is showing.
 *
 * One container rather than three dialogs, because that is what the design is:
 * the card stays put and its contents change, so filing a report never looks
 * like one window closing and another opening.
 */
type View3 = "choose" | "done" | "already";

interface ReportDialogProps {
  /**
   * The post being reported, or null when nothing is.
   *
   * The post rather than an id plus a pile of flags: the dialog needs its
   * isReported, its reportId and its reportReason, and three props that must
   * agree with each other are three chances for them not to.
   */
  post: FeedPost | null;
  onClose: () => void;
}

/**
 * The report flow, over whatever screen opened it.
 *
 * ONE PER SCREEN, never one per card. A dialog rendered inside a feed row would
 * be unmounted by FlatList the moment that row scrolled out of the window -
 * taking an open, mid-submit dialog with it - and twenty rows would mean twenty
 * modal hosts.
 *
 * It reaches for useReportPost itself rather than being handed a submit
 * function, the way CommentRow reaches for its own stylesheet: the alternative
 * is both call sites declaring, wiring and resetting the same four pieces of
 * state, which is ceremony that only creates ways for them to drift apart.
 */
const ReportDialog = ({ post, onClose }: ReportDialogProps) => {
  const { colors } = useTheme();
  const styles = useReportDialogStyles();
  const {
    submitReport,
    withdrawReport,
    isSubmitting,
    isWithdrawing,
    error,
    reset,
  } = useReportPost();

  const [view, setView] = useState<View3>("choose");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  /**
   * The post as it was when the dialog opened, held so the exit animation has
   * something to draw.
   *
   * `post` goes null the instant the caller closes, but the card is still on
   * screen for OUT_MS after that. Without this the dialog would blank out and
   * then fade an empty box.
   */
  const lastPost = useRef<FeedPost | null>(null);
  if (post) lastPost.current = post;
  const subject = post ?? lastPost.current;

  const visible = post !== null;

  // Trails `visible` by the exit animation. The Modal is mounted while EITHER
  // is true, so the close animation gets to run before the window goes away.
  const [isMounted, setIsMounted] = useState(false);

  const scrim = useRef(new Animated.Value(0)).current;
  const dialog = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  // The lift's target, tracked in JS because a native-driven Animated.Value
  // does not read back reliably - and because measureInWindow on iOS returns
  // the TRANSFORMED position, so a second keyboard event would measure a dialog
  // that is already raised and raise it again.
  const liftTarget = useRef(0);
  const card = useRef<View>(null);

  const busy = isSubmitting || isWithdrawing;

  /**
   * Closing is refused while a write is in flight.
   *
   * The spinner is the "wait" affordance; letting the scrim dismiss the dialog
   * underneath a request would leave the result landing on nothing.
   */
  const requestClose = useCallback(() => {
    if (busy) return;
    Keyboard.dismiss();
    onClose();
  }, [busy, onClose]);

  /**
   * Which post the open dialog was opened FOR, so the reset below fires once.
   *
   * Keyed on the id rather than the object, and that is not a micro-optimisation
   * - it is what stops the confirmation screen from being erased the instant it
   * appears. A filed report writes the store, the store hands back a new post
   * object, and an effect watching identity would then "reopen" the dialog and
   * put it straight back to "already", one frame after the submit set it to
   * "done".
   */
  const openedFor = useRef<string | null>(null);

  // Opening resets the draft. The RISING edge, not the falling one: `isMounted`
  // outlives `visible` by the exit animation, so clearing on the way out would
  // visibly empty the selected row for 140ms as the dialog faded.
  useEffect(() => {
    if (!post) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === post.id) return;

    openedFor.current = post.id;
    setView(post.isReported ? "already" : "choose");
    setReason(null);
    setDetails("");
    reset();
  }, [post, reset]);

  useEffect(() => {
    if (visible) setIsMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!isMounted) return;

    if (visible) {
      Animated.parallel([
        Animated.timing(scrim, {
          toValue: 1,
          duration: SCRIM_IN_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dialog, {
          toValue: 1,
          duration: DIALOG_IN_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    const out = Animated.parallel([
      Animated.timing(scrim, {
        toValue: 0,
        duration: OUT_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(dialog, {
        toValue: 0,
        duration: OUT_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    // `finished` is load-bearing. Reopening mid-exit interrupts this animation,
    // and an unguarded callback would then unmount the dialog that just
    // reopened.
    out.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
        lift.setValue(0);
        liftTarget.current = 0;
      }
    });
    return () => out.stop();
  }, [visible, isMounted, scrim, dialog, lift]);

  /**
   * Lifts the dialog clear of the keyboard, by as much as it actually overlaps.
   *
   * A transform rather than the margin the comment composer uses, and the
   * difference is what sits below each: the composer has a scroller that must
   * SHRINK so the newest comment stays reachable, while this is a free-floating
   * box with nothing underneath it to shorten.
   *
   * useNativeDriver MUST match the entrance animation's. The lift and the
   * entrance scale share one transform array, and mixing drivers on a single
   * node throws at runtime.
   */
  useEffect(() => {
    if (!isMounted) return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const run = (toValue: number, duration?: number) => {
      liftTarget.current = toValue;
      Animated.timing(lift, {
        toValue,
        duration: duration || FALLBACK_KEYBOARD_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    };

    const onShow = Keyboard.addListener(showEvent, (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      card.current?.measureInWindow((_x, y, _width, height) => {
        // Subtracting the current target is what makes this idempotent: on iOS
        // the measurement already includes the lift applied last time.
        const restingBottom = y - liftTarget.current + height;
        const overlap = restingBottom - keyboardTop;
        run(overlap > 0 ? -(overlap + KEYBOARD_GAP) : 0, event.duration);
      });
    });
    const onHide = Keyboard.addListener(hideEvent, (event) =>
      run(0, event.duration),
    );

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [isMounted, lift]);

  if (!isMounted || !subject) return null;

  const needsDetails = reason === DETAILED_REASON;
  const canSubmit =
    reason !== null && (!needsDetails || details.trim().length > 0) && !busy;

  const onSubmit = async () => {
    if (!reason) return;
    const filed = await submitReport(
      subject,
      reason,
      needsDetails ? details : undefined,
    );
    // Only on success. A failure leaves the picker up with the error beneath it,
    // so the reason the person chose is still there to retry with.
    if (filed) setView("done");
  };

  const onWithdraw = async () => {
    const pulled = await withdrawReport(subject);
    // Back to the picker rather than closing: withdrawing by mistake is as easy
    // as reporting by mistake, and the list is what undoes it.
    if (pulled) {
      setView("choose");
      setReason(null);
      setDetails("");
    }
  };

  const errorBox = error ? (
    <View style={styles.error}>
      <Feather name="alert-circle" size={16} color={colors.danger} />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  ) : null;

  return (
    <Modal
      visible
      transparent
      // We drive both halves ourselves; RN's own "fade" cannot scale, and would
      // run against the animation below rather than with it.
      animationType="none"
      // Android draws a modal in its own window, laid out below the system bars
      // unless told otherwise - without these the scrim stops short and leaves a
      // strip of the feed showing above and below it. navigationBarTranslucent
      // requires statusBarTranslucent, so the two travel together.
      statusBarTranslucent
      navigationBarTranslucent
      // The Android hardware back button, and VoiceOver's two-finger escape.
      // Without it, back is a silent no-op on a screen offering no other way out.
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: scrim }]}>
          {/*
            No pressed-opacity callback: that feedback is for controls, and a
            scrim that dims under a finger reads as a rendering fault. Hidden
            from screen readers so VoiceOver does not land on a full-screen
            button ahead of the dialog - the close button and the escape gesture
            are the accessible ways out.
          */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessible={false}
          />
        </Animated.View>

        <Animated.View
          ref={card}
          style={[
            styles.dialog,
            {
              opacity: dialog,
              // translateY BEFORE scale, so the lift is not multiplied by the
              // 0.94 the dialog enters at.
              transform: [
                { translateY: lift },
                {
                  scale: dialog.interpolate({
                    inputRange: [0, 1],
                    outputRange: [ENTER_SCALE, 1],
                  }),
                },
              ],
            },
          ]}
          accessibilityViewIsModal
        >
          <LinearGradient
            colors={colors.gradients.surface}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.fill}
          >
            {view === "choose" ? (
              <>
                <View style={styles.header}>
                  <Text style={styles.title}>Report post</Text>
                  <Text style={styles.subline}>
                    Tell us what’s wrong with this post.
                  </Text>
                </View>
                <View style={styles.rule} />

                <ScrollView
                  // flexShrink, not flex: the list sizes to its content until
                  // the dialog hits its maxHeight, and only then starts to
                  // scroll. flex:1 would stretch a five-row list down the screen.
                  style={styles.listScroll}
                  contentContainerStyle={styles.list}
                  // Without this, the first tap on another reason while the
                  // details box has focus only dismisses the keyboard and is
                  // swallowed.
                  keyboardShouldPersistTaps="handled"
                >
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Reason for reporting"
                    style={styles.reasonGroup}
                  >
                    {REPORT_REASONS.map((value) => {
                      const selected = reason === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setReason(value)}
                          disabled={busy}
                          // A radio, not a checkbox, despite the square box: the
                          // list is single-select because a report carries one
                          // reason. The shape is the design's, the semantics are
                          // the behaviour's, and the behaviour wins.
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected, disabled: busy }}
                          accessibilityLabel={REASON_LABELS[value]}
                          style={({ pressed }) => [
                            styles.reason,
                            selected && styles.reasonSelected,
                            busy && { opacity: 0.5 },
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <View
                            style={[styles.box, selected && styles.boxSelected]}
                          >
                            {selected ? (
                              <Feather
                                name="check"
                                size={REPORT_CHECK_ICON_SIZE}
                                color="#ffffff"
                              />
                            ) : null}
                          </View>
                          <Text
                            style={[
                              styles.reasonLabel,
                              selected && styles.reasonLabelSelected,
                            ]}
                          >
                            {REASON_LABELS[value]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {needsDetails ? (
                    <View>
                      <TextInput
                        style={styles.detail}
                        value={details}
                        onChangeText={setDetails}
                        placeholder="Describe what's wrong - a sentence is plenty."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        maxLength={MAX_REPORT_DETAILS}
                        editable={!busy}
                        accessibilityLabel="Why you are reporting this post"
                      />
                      <Text style={styles.counter}>
                        {details.length} / {MAX_REPORT_DETAILS}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                {errorBox}
                <View style={styles.rule} />

                <View style={styles.footer}>
                  <Pressable
                    onPress={onSubmit}
                    disabled={!canSubmit}
                    accessibilityRole="button"
                    accessibilityLabel="Submit report"
                    accessibilityState={{
                      disabled: !canSubmit,
                      busy: isSubmitting,
                    }}
                    style={({ pressed }) => [
                      styles.submit,
                      !canSubmit && styles.submitDisabled,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <LinearGradient
                      colors={colors.gradients.primary}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.submitFill}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.submitLabel}>Submit report</Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            ) : null}

            {view === "done" ? (
              <>
                <View style={styles.stateBody}>
                  <View style={[styles.stateCircle, styles.stateCircleDone]}>
                    <Feather
                      name="check"
                      size={REPORT_STATE_ICON_SIZE}
                      color={colors.success}
                    />
                  </View>
                  <Text style={styles.stateTitle}>Report submitted</Text>
                  <Text style={styles.stateText}>
                    Thanks — we have your report and the team will review this
                    post. You can withdraw it at any time.
                  </Text>
                </View>

                <View style={styles.footer}>
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    style={({ pressed }) => [
                      styles.submit,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <LinearGradient
                      colors={colors.gradients.primary}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.submitFill}
                    >
                      <Text style={styles.submitLabel}>Done</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            ) : null}

            {view === "already" ? (
              <>
                <View style={styles.stateBody}>
                  <View style={[styles.stateCircle, styles.stateCircleReported]}>
                    <FontAwesome
                      name="flag"
                      size={REPORT_STATE_FLAG_SIZE}
                      color={colors.danger}
                    />
                  </View>
                  <Text style={styles.stateTitle}>You reported this post</Text>
                  <Text style={styles.stateText}>
                    {subject.reportReason
                      ? `Filed as ${REASON_LABELS[subject.reportReason]}. `
                      : ""}
                    It is with the team now — withdraw it if you reported this
                    post by mistake.
                  </Text>
                </View>

                {errorBox}

                <View style={styles.footer}>
                  <Pressable
                    onPress={onWithdraw}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw report"
                    accessibilityState={{ disabled: busy, busy: isWithdrawing }}
                    style={({ pressed }) => [
                      styles.secondary,
                      busy && styles.submitDisabled,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    {isWithdrawing ? (
                      <ActivityIndicator color={colors.danger} />
                    ) : (
                      <Text style={styles.secondaryLabel}>Withdraw report</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={requestClose}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    accessibilityState={{ disabled: busy }}
                    style={({ pressed }) => [
                      styles.submit,
                      busy && styles.submitDisabled,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <LinearGradient
                      colors={colors.gradients.primary}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.submitFill}
                    >
                      <Text style={styles.submitLabel}>Close</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </>
            ) : null}
          </LinearGradient>

          {/*
            Only while a reason is being chosen. Once the report is filed, the
            dialog's own button is the way out, and a second dismiss in the
            corner would compete with it for the same job.
          */}
          {view === "choose" ? (
            <Pressable
              style={styles.close}
              onPress={requestClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close without reporting"
              accessibilityState={{ disabled: busy }}
            >
              <Feather
                name="x"
                size={REPORT_CLOSE_ICON_SIZE}
                color={colors.danger}
              />
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
};

export default ReportDialog;
