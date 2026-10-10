import { useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  type PressableStateCallbackType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import RegistrationChecks from "@components/RegistrationChecks";
import {
  useTheme,
  useLoginStyles,
  useRegisterStyles,
  useForgotPasswordStyles,
  LOGIN_ICON_SIZE,
} from "@theme";
import {
  useForgotPassword,
  isValidEmail,
  normalizeResetCode,
  evaluateRegistration,
  withinPasswordLimit,
  PASSWORD_CHECK_GROUPS,
  RESET_CODE_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@data";

/** The same asset, reached the same way, as the login screen - see there. */
const LOGO = require("../../../packages/shared/assets/stdy.png");

/** Pressable's state as react-native-web delivers it - see login.tsx. */
type WebPressState = PressableStateCallbackType & { hovered?: boolean };

/** One box per character, left to right. */
const SLOTS = Array.from({ length: RESET_CODE_LENGTH }, (_, i) => i);

type Step = "email" | "code" | "password" | "done";

/**
 * Forgot password.
 *
 * Reached from the login screen's "Forgot password?", and like login it exists
 * only while nobody is signed in. Four steps on one screen, each replacing the
 * last in place, with the submit button under whichever is showing:
 *
 *   email    - where to send a code
 *   code     - six slots for the code from the email
 *   password - the new password, twice
 *   done     - the way back to login
 *
 * The slots are six boxes drawn over ONE hidden input, not six inputs. Every
 * tap on the row lands on that input and its caret is pinned to the end, so
 * typing always fills the first empty box from the left - there is no picking a
 * box to start in. Pasting or OS autofill fills all six at once.
 *
 * A reset does not sign anyone in: it signs the account out everywhere, and
 * the user logs in with the new password.
 *
 * Shares login's stylesheet for everything the screens have in common, borrows
 * register's mismatch edge, and adds only its own pieces from
 * forgotPassword.styles.ts.
 */
const ForgotPassword = () => {
  const { colors } = useTheme();
  const styles = useLoginStyles();
  const registerStyles = useRegisterStyles();
  const own = useForgotPasswordStyles();
  const insets = useSafeAreaInsets();
  const {
    requestCode,
    verifyCode,
    resetPassword,
    isSubmitting,
    error,
    reset,
  } = useForgotPassword();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
  // Set only by a rejected code, so a failed resend does not paint the slots.
  const [codeRejected, setCodeRejected] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  // One state for both fields - see register.tsx.
  const [revealed, setRevealed] = useState(false);

  const repeatInput = useRef<TextInput>(null);

  // register's password rules, without its email ones - the same four the
  // checks panel shows, so the button wakes exactly when the panel goes green.
  // The API enforces only length; the rest is the app's own bar.
  const checks = evaluateRegistration("", password, repeat);
  const passwordReady =
    checks.length &&
    checks.number &&
    checks.special &&
    checks.match &&
    withinPasswordLimit(password);
  const repeatMismatch = repeat.length > 0 && !checks.match;

  // Back to login - see register.tsx.
  const toLogin = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/login");
  };

  // Any edit clears a shown error - see register.tsx.
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) reset();
  };

  const editCode = (value: string) => {
    setCode(normalizeResetCode(value));
    setCodeRejected(false);
    if (error) reset();
  };

  const sendCode = async () => {
    // Kept up on purpose: the code step focuses its input straight away, and
    // dropping the keyboard only to raise it again would bounce the screen.
    if (await requestCode(email.trim())) {
      setCode("");
      setStep("code");
    }
  };

  const verify = async () => {
    if (await verifyCode(email.trim(), code)) {
      setStep("password");
    } else {
      setCodeRejected(true);
    }
  };

  const updatePassword = async () => {
    Keyboard.dismiss();
    if (await resetPassword(password)) {
      setPassword("");
      setRepeat("");
      setStep("done");
    }
  };

  const resend = async () => {
    setCodeRejected(false);
    if (await requestCode(email.trim())) setCode("");
  };

  // Back to the email step, keeping what was typed: from the code step to fix
  // a typo, and from the password step when the reset session has run out.
  const startOver = () => {
    reset();
    setCode("");
    setCodeRejected(false);
    setPassword("");
    setRepeat("");
    setStep("email");
  };

  /** The one gradient button, per step. */
  const submitFor: Record<Step, { label: string; ready: boolean; run: () => void }> = {
    email: { label: "Send code", ready: isValidEmail(email), run: sendCode },
    code: { label: "Verify", ready: code.length === RESET_CODE_LENGTH, run: verify },
    password: { label: "Update password", ready: passwordReady, run: updatePassword },
    done: { label: "Back to log in", ready: true, run: toLogin },
  };
  const submit = submitFor[step];
  // The app validates by disabling - see register.tsx.
  const canSubmit = submit.ready && !isSubmitting;
  const onSubmit = () => {
    if (canSubmit) submit.run();
  };

  const textLink = (
    label: string,
    onPress: () => void,
    accessibilityLabel = label,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={isSubmitting}
      hitSlop={8}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isSubmitting }}
    >
      {({ hovered }: WebPressState) => (
        <Text
          style={[
            styles.rowText,
            styles.link,
            hovered && !isSubmitting && styles.linkHovered,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );

  const heading = (headline: string, subline: ReactNode) => (
    <View style={styles.heading}>
      <Text style={styles.headline}>{headline}</Text>
      {subline}
    </View>
  );

  const revealButton = (
    <Pressable
      onPress={() => setRevealed((shown) => !shown)}
      style={({ pressed }) => [styles.reveal, pressed && { opacity: 0.6 }]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={revealed ? "Hide passwords" : "Show passwords"}
    >
      <Feather
        name={revealed ? "eye-off" : "eye"}
        size={LOGIN_ICON_SIZE}
        color={colors.textMuted}
      />
    </Pressable>
  );

  const renderStep = () => {
    switch (step) {
      case "email":
        return (
          <>
            {heading(
              "Forgot password?",
              <Text style={styles.subline}>
                Enter your email and we&apos;ll send you a 6-character code.
              </Text>,
            )}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={edit(setEmail)}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                submitBehavior="submit"
                autoFocus
                accessibilityLabel="Email"
              />
            </View>
          </>
        );

      case "code":
        return (
          <>
            {heading(
              "Enter your code",
              <View style={own.subRow}>
                <Text style={styles.subline}>
                  We sent a 6-character code to{" "}
                  <Text style={own.email}>{email.trim()}</Text>.
                </Text>
                {textLink("Change email", startOver)}
              </View>,
            )}
            <View style={own.slots}>
              {SLOTS.map((i) => (
                <View
                  key={i}
                  style={[
                    own.slot,
                    codeFocused && i === code.length && own.slotActive,
                    codeRejected && own.slotInvalid,
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={own.slotChar}>{code[i] ?? ""}</Text>
                </View>
              ))}
              {/*
                Last, so it sits over the boxes and takes every tap. The pinned
                selection keeps the caret at the end, on web included, so
                nothing can be typed into the middle of the code.
              */}
              <TextInput
                style={own.hiddenInput}
                value={code}
                onChangeText={editCode}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                selection={{ start: code.length, end: code.length }}
                maxLength={RESET_CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                caretHidden
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                submitBehavior="submit"
                autoFocus
                accessibilityLabel={`Verification code, ${RESET_CODE_LENGTH} characters`}
                accessibilityValue={{ text: code }}
              />
            </View>
          </>
        );

      case "password":
        return (
          <>
            {heading(
              "Set a new password",
              <Text style={styles.subline}>
                Choose a new password for your account.
              </Text>,
            )}
            <View style={styles.field}>
              <Text style={styles.label}>New password</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={edit(setPassword)}
                  placeholder="Your new password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!revealed}
                  maxLength={MAX_PASSWORD_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  returnKeyType="next"
                  onSubmitEditing={() => repeatInput.current?.focus()}
                  submitBehavior="submit"
                  autoFocus
                  accessibilityLabel="New password"
                />
                {revealButton}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Repeat password</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  ref={repeatInput}
                  style={[
                    styles.input,
                    styles.passwordInput,
                    repeatMismatch && registerStyles.inputInvalid,
                  ]}
                  value={repeat}
                  onChangeText={edit(setRepeat)}
                  placeholder="Type it again"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!revealed}
                  maxLength={MAX_PASSWORD_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="newPassword"
                  autoComplete="new-password"
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                  accessibilityLabel="Repeat password"
                />
                {revealButton}
              </View>
            </View>
            <RegistrationChecks
              results={checks}
              groups={PASSWORD_CHECK_GROUPS}
              title="Password checks"
            />
          </>
        );

      case "done":
        return heading(
          "Password updated",
          <Text style={styles.subline}>
            You&apos;ve been signed out everywhere. Log in with your new
            password.
          </Text>,
        );
    }
  };

  return (
    <LinearGradient
      colors={colors.gradients.background}
      style={styles.container}
    >
      {/* light-content in both themes, for the reason login gives. */}
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={[styles.banner, { paddingTop: insets.top + 12 }]}>
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="stdy - study sessions, shared"
          />
        </View>

        <View style={[styles.form, { paddingBottom: 24 + insets.bottom }]}>
          {renderStep()}

          {error ? (
            <View
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Feather
                name="alert-circle"
                size={LOGIN_ICON_SIZE}
                color={colors.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit}
            style={({ pressed, hovered }: WebPressState) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              hovered && canSubmit && styles.lifted,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={submit.label}
            accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
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
                <Text style={styles.submitLabel}>{submit.label}</Text>
              )}
            </LinearGradient>
          </Pressable>

          {step === "code" ? (
            <View style={own.resendRow}>
              {textLink("Didn't get it? Resend code", resend, "Resend code")}
            </View>
          ) : null}

          {/* The way out when the reset session has run out - see useForgotPassword. */}
          {step === "password" ? (
            <View style={own.resendRow}>
              {textLink("Request a new code", startOver)}
            </View>
          ) : null}

          {/* The way back, in the spot sign-up keeps its own. Done's button already is one. */}
          {step === "done" ? null : (
            <View style={styles.signup}>
              <Pressable
                onPress={toLogin}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="Back to log in"
              >
                {({ hovered }: WebPressState) => (
                  <Text
                    style={[
                      styles.rowText,
                      styles.signupLabel,
                      styles.link,
                      hovered && styles.linkHovered,
                    ]}
                  >
                    Back to log in
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default ForgotPassword;
