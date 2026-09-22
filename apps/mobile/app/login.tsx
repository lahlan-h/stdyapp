import { useRef, useState } from "react";
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

import GoogleMark from "@components/GoogleMark";
import {
  useTheme,
  useLoginStyles,
  LOGIN_ICON_SIZE,
  LOGIN_CHECK_ICON_SIZE,
  LOGIN_GOOGLE_MARK_SIZE,
} from "@theme";
import { useLogin } from "@data";

/**
 * The real logo, from the shared package rather than a copy in this app.
 *
 * A relative path because packages/shared's `exports` map only exposes its
 * source, so "@stdyapp/shared/assets/..." would not resolve. Metro can reach it
 * because metro.config.js already watches the repo root.
 */
const LOGO = require("../../../packages/shared/assets/stdy.png");

/**
 * Pressable's state as react-native-web delivers it.
 *
 * RN's own type has only `pressed`, because there is no hover on a phone. On
 * web the same callback also receives `hovered`, which is the only place the
 * hover states below ever apply; on native it is simply undefined.
 */
type WebPressState = PressableStateCallbackType & { hovered?: boolean };

/**
 * Sign in.
 *
 * The screen the app opens on whenever nobody is signed in - the root layout's
 * guard sends every route here until the session exists. The email/username
 * and password login works, and Sign up opens the registration screen.
 * Continue with Google, Remember me and Forgot password? are laid out so the
 * screen is complete, and are deliberately static until there is something
 * behind them: the API has no OAuth and no password reset.
 */
const Login = () => {
  const { colors } = useTheme();
  const styles = useLoginStyles();
  const insets = useSafeAreaInsets();
  const { login, devBypass, isSubmitting, error, reset } = useLogin();
  // Which way in is in flight, so the spinner lands on the button that was
  // pressed. The hook's isSubmitting is shared between the two on purpose.
  const [bypassing, setBypassing] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  // Static: it toggles so the control does not look broken, but nothing reads
  // it. The session is memory-only whatever this says.
  const [remember, setRemember] = useState(false);

  const passwordInput = useRef<TextInput>(null);

  // The app validates by disabling, never with text under a field: one
  // boolean, one dimmed button.
  const canSubmit =
    identifier.trim().length > 0 && password.length > 0 && !isSubmitting;

  // Any edit clears a shown error - it described the attempt, and the user
  // is now changing it.
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) reset();
  };

  const submit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    // No navigation on success: signing in flips the session and the root
    // layout's guard moves to the feed. On failure `error` is already set.
    await login(identifier, password);
  };

  const bypass = async () => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    setBypassing(true);
    await devBypass();
    setBypassing(false);
  };

  return (
    <LinearGradient
      colors={colors.gradients.background}
      style={styles.container}
    >
      {/*
        light-content in both themes: the banner under the status bar is
        dark in light mode, and in dark mode the whole screen is.
      */}
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
          <View style={styles.heading}>
            <Text style={styles.headline}>Welcome back</Text>
            <Text style={styles.subline}>
              Log in to pick up your streak where you left it.
            </Text>
          </View>

          {/* Static - see the component comment. */}
          <Pressable
            style={({ pressed, hovered }: WebPressState) => [
              styles.google,
              hovered && styles.lifted,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityHint="Not available yet"
            accessibilityState={{ disabled: true }}
          >
            <GoogleMark size={LOGIN_GOOGLE_MARK_SIZE} />
            <Text style={styles.googleLabel}>Continue with Google</Text>
          </Pressable>

          <View style={styles.or} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.orRule} />
            <Text style={styles.orLabel}>OR</Text>
            <View style={styles.orRule} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email or username</Text>
            {/*
              One field, not two: the API's login takes a single `identifier`
              and works out which it is. keyboardType is the email one because
              that keyboard has both "@" and "_" on its first page.
            */}
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={edit(setIdentifier)}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="username"
              autoComplete="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
              submitBehavior="submit"
              accessibilityLabel="Email or username"
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  ref={passwordInput}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={edit(setPassword)}
                  placeholder="Your password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!revealed}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setRevealed((shown) => !shown)}
                  style={({ pressed }) => [
                    styles.reveal,
                    pressed && { opacity: 0.6 },
                  ]}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={
                    revealed ? "Hide password" : "Show password"
                  }
                >
                  <Feather
                    name={revealed ? "eye-off" : "eye"}
                    size={LOGIN_ICON_SIZE}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.row}>
              <Pressable
                onPress={() => setRemember((checked) => !checked)}
                style={({ pressed }) => [
                  styles.remember,
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                accessibilityLabel="Remember me"
              >
                <View style={[styles.box, remember && styles.boxChecked]}>
                  {remember ? (
                    // The primary GRADIENT, not colors.primary: it is the same
                    // blue in both themes, which is what makes the white tick
                    // right in both - the submit label's rule.
                    <LinearGradient
                      colors={colors.gradients.primary}
                      style={styles.boxFill}
                    >
                      <Feather
                        name="check"
                        size={LOGIN_CHECK_ICON_SIZE}
                        color="#ffffff"
                      />
                    </LinearGradient>
                  ) : null}
                </View>
                <Text style={styles.rowText}>Remember me</Text>
              </Pressable>

              {/* Static: the API has no password-reset flow to start. */}
              <Pressable
                hitSlop={8}
                accessibilityRole="link"
                accessibilityHint="Not available yet"
                accessibilityState={{ disabled: true }}
              >
                {({ hovered }: WebPressState) => (
                  <Text
                    style={[
                      styles.rowText,
                      styles.link,
                      hovered && styles.linkHovered,
                    ]}
                  >
                    Forgot password?
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

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
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed, hovered }: WebPressState) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              hovered && canSubmit && styles.lifted,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Log in"
            accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.submitFill}
            >
              {isSubmitting && !bypassing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitLabel}>Log in</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/*
            Development builds only. __DEV__ is false in any release build, so
            this cannot ship - and the API refuses the route outside
            NODE_ENV=development regardless.
          */}
          {__DEV__ ? (
            <>
              <View
                style={styles.or}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={styles.orRule} />
                <Text style={styles.orLabel}>DEV BYPASS</Text>
                <View style={styles.orRule} />
              </View>

              <Pressable
                onPress={bypass}
                disabled={isSubmitting}
                style={({ pressed, hovered }: WebPressState) => [
                  styles.devButton,
                  hovered && !isSubmitting && styles.lifted,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue as the dev account"
                accessibilityHint="Development builds only. Skips login."
                accessibilityState={{ disabled: isSubmitting, busy: bypassing }}
              >
                {bypassing ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <>
                    <Feather
                      name="terminal"
                      size={LOGIN_ICON_SIZE}
                      color={colors.textMuted}
                    />
                    <Text style={styles.devLabel}>Continue as dev account</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          <View style={styles.signup}>
            <Pressable
              onPress={() => router.push("/register")}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Sign up"
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
                  No account? Sign up!
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default Login;
