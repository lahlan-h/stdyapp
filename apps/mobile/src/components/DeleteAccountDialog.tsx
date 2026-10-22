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

import {
  useTheme,
  useReportDialogStyles,
  useDeleteAccountDialogStyles,
  REPORT_CLOSE_ICON_SIZE,
  DELETE_REVEAL_ICON_SIZE,
  DELETE_GOOGLE_MARK_SIZE,
} from "@theme";
import { useDeleteAccount, useGoogleIdToken, useProfile } from "@data";

import GoogleMark from "@components/GoogleMark";

/** Scrim in, dialog in, and both back out - ReportDialog's timings. */
const SCRIM_IN_MS = 180;
const DIALOG_IN_MS = 200;
const OUT_MS = 140;

/** How small the dialog starts before it settles. */
const ENTER_SCALE = 0.94;

/** Breathing room between the lifted dialog and the top of the keyboard. */
const KEYBOARD_GAP = 24;

/** Used when a keyboard event arrives without its own duration, as Android's do. */
const FALLBACK_KEYBOARD_MS = 250;

interface DeleteAccountDialogProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Asks for the password before deleting the account - the one thing in
 * Settings that cannot be undone, so the row opens this rather than acting.
 *
 * ReportDialog's card, scrim, entrance and keyboard lift, deliberately: it is
 * this app's one dialog, and a second shape of popup would be the only one.
 * The mechanics are repeated here rather than shared because they are a
 * handful of effects bound to this card's own refs.
 *
 * A Google button joins the password field when a Google account is linked.
 * An account Google created was given a password nobody was told, so for it
 * a fresh Google sign-in is the only proof there is; a linked account that
 * also has a password can use either.
 *
 * On success nothing here navigates. useDeleteAccount signs this device out,
 * and the root layout's guard moves to login - as it does after Sign out.
 */
const DeleteAccountDialog = ({ visible, onClose }: DeleteAccountDialogProps) => {
  const { colors } = useTheme();
  const styles = useReportDialogStyles();
  const own = useDeleteAccountDialogStyles();
  const { profile } = useProfile();
  const { deleteAccount, isDeleting, error, reset } = useDeleteAccount();
  const google = useGoogleIdToken();

  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);

  // Trails `visible` by the exit animation - see ReportDialog.
  const [isMounted, setIsMounted] = useState(false);

  const scrim = useRef(new Animated.Value(0)).current;
  const dialog = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const liftTarget = useRef(0);
  const card = useRef<View>(null);

  const busy = isDeleting || google.isPrompting;

  /** Refused while a delete is in flight, for ReportDialog's reason. */
  const requestClose = useCallback(() => {
    if (busy) return;
    Keyboard.dismiss();
    onClose();
  }, [busy, onClose]);

  // Opening clears the last attempt - on the rising edge, so the field does
  // not visibly empty while the dialog fades out.
  const resetGoogle = google.reset;
  useEffect(() => {
    if (!visible) return;
    setPassword("");
    setRevealed(false);
    reset();
    resetGoogle();
  }, [visible, reset, resetGoogle]);

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

    // `finished` guards a reopen mid-exit, as in ReportDialog.
    out.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
        lift.setValue(0);
        liftTarget.current = 0;
      }
    });
    return () => out.stop();
  }, [visible, isMounted, scrim, dialog, lift]);

  // Lifts the card clear of the keyboard by exactly the overlap - see
  // ReportDialog for why the current target is subtracted back out.
  useEffect(() => {
    if (!isMounted) return;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

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
        const restingBottom = y - liftTarget.current + height;
        const overlap = restingBottom - keyboardTop;
        run(overlap > 0 ? -(overlap + KEYBOARD_GAP) : 0, event.duration);
      });
    });
    const onHide = Keyboard.addListener(hideEvent, (event) => run(0, event.duration));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [isMounted, lift]);

  if (!isMounted) return null;

  // No profile yet means no id to delete, so nothing can be sent - the first
  // render after opening, before GET /api/auth/me has answered.
  const canDelete = Boolean(profile) && password.length > 0 && !busy;

  const onDelete = async () => {
    if (!profile || password.length === 0) return;
    Keyboard.dismiss();
    // Never trimmed: a space in a password is part of it.
    await deleteAccount(profile.id, { password });
  };

  const onConfirmWithGoogle = async () => {
    if (!profile) return;
    Keyboard.dismiss();
    reset();
    const googleIdToken = await google.requestIdToken();
    if (googleIdToken) await deleteAccount(profile.id, { googleIdToken });
  };

  const shownError = error ?? google.error;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: scrim }]}>
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
            <View style={styles.header}>
              <Text style={styles.title}>Delete account?</Text>
              <Text style={styles.subline}>
                Type your password to confirm. This can’t be undone.
              </Text>
            </View>
            <View style={styles.rule} />

            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={own.body}
              keyboardShouldPersistTaps="handled"
            >
              <View style={own.warning}>
                <Feather name="alert-triangle" size={16} color={colors.danger} />
                <Text style={own.warningText}>
                  Your profile, study sessions, posts, comments, routines,
                  messages and any study groups you own are deleted for good.
                  Members of your groups will be told they were disbanded.
                </Text>
              </View>

              <Text style={own.label}>Password</Text>
              <View style={own.inputWrap}>
                <TextInput
                  style={own.input}
                  value={password}
                  onChangeText={(next) => {
                    setPassword(next);
                    if (error) reset();
                  }}
                  placeholder="Your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!revealed}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (canDelete) void onDelete();
                  }}
                  editable={!busy}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setRevealed((shown) => !shown)}
                  style={({ pressed }) => [own.reveal, pressed && { opacity: 0.6 }]}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={revealed ? "Hide password" : "Show password"}
                >
                  <Feather
                    name={revealed ? "eye-off" : "eye"}
                    size={DELETE_REVEAL_ICON_SIZE}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>

              {profile?.hasGoogle ? (
                <>
                  <Text style={own.or}>or</Text>
                  <Pressable
                    onPress={onConfirmWithGoogle}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm with Google"
                    accessibilityState={{ disabled: busy, busy: google.isPrompting }}
                    style={({ pressed }) => [
                      own.google,
                      busy && styles.submitDisabled,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {google.isPrompting ? (
                      <ActivityIndicator color={colors.textMuted} />
                    ) : (
                      <>
                        <GoogleMark size={DELETE_GOOGLE_MARK_SIZE} />
                        <Text style={own.googleLabel}>Confirm with Google</Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : null}
            </ScrollView>

            {shownError ? (
              <View style={styles.error}>
                <Feather name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{shownError}</Text>
              </View>
            ) : null}
            <View style={[styles.rule, { marginTop: 16 }]} />

            <View style={styles.footer}>
              <Pressable
                onPress={onDelete}
                disabled={!canDelete}
                accessibilityRole="button"
                accessibilityLabel="Delete account"
                accessibilityState={{ disabled: !canDelete, busy: isDeleting }}
                style={({ pressed }) => [
                  styles.submit,
                  !canDelete && styles.submitDisabled,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <LinearGradient
                  colors={colors.gradients.danger}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.submitFill}
                >
                  {isDeleting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitLabel}>Delete account</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={requestClose}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: busy }}
                style={({ pressed }) => [
                  own.cancel,
                  busy && styles.submitDisabled,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={own.cancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <Pressable
            style={styles.close}
            onPress={requestClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Close without deleting"
            accessibilityState={{ disabled: busy }}
          >
            <Feather name="x" size={REPORT_CLOSE_ICON_SIZE} color={colors.danger} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default DeleteAccountDialog;
