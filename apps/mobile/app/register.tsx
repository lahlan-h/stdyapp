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
import RegistrationChecks from "@components/RegistrationChecks";
import {
  useTheme,
  useLoginStyles,
  useRegisterStyles,
  LOGIN_ICON_SIZE,
  LOGIN_GOOGLE_MARK_SIZE,
} from "@theme";
import {
  useRegister,
  evaluateRegistration,
  countPassed,
  isValidUsername,
  withinPasswordLimit,
  REGISTRATION_CHECK_COUNT,
  MAX_USERNAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@data";

/** The same asset, reached the same way, as the login screen - see there. */
const LOGO = require("../../../packages/shared/assets/stdy.png");

/** Pressable's state as react-native-web delivers it - see login.tsx. */
type WebPressState = PressableStateCallbackType & { hovered?: boolean };

/**
 * Sign up.
 *
 * Reached from the login screen's "Sign up", and like login it exists only
 * while nobody is signed in. Registering signs the new account straight in -
 * the API answers with a token pair - so there is no navigation on success:
 * the root layout's guard moves the app to the feed.
 *
 * Everything works except Continue with Google, which is static for the same
 * reason as on login: the API has no OAuth yet.
 *
 * Shares login's stylesheet for everything the two screens have in common and
 * adds only its own pieces from register.styles.ts.
 */
const Register = () => {
  const { colors } = useTheme();
  const styles = useLoginStyles();
  const own = useRegisterStyles();
  const insets = useSafeAreaInsets();
  const { register, isSubmitting, error, reset } = useRegister();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  // ONE state for both password fields. Revealing is for comparing the two,
  // and a pair where only one is shown makes that comparison impossible.
  const [revealed, setRevealed] = useState(false);

  const usernameInput = useRef<TextInput>(null);
  const firstNameInput = useRef<TextInput>(null);
  const lastNameInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const repeatInput = useRef<TextInput>(null);

  const results = evaluateRegistration(email, password, repeat);
  const repeatMismatch = repeat.length > 0 && !results.match;

  // The app validates by disabling: the checklist says what is missing, and
  // the button stays dimmed until there is nothing left. The username rule and
  // the byte limit gate it too, without rows of their own.
  const canSubmit =
    countPassed(results) === REGISTRATION_CHECK_COUNT &&
    isValidUsername(username) &&
    withinPasswordLimit(password) &&
    !isSubmitting;

  // Any edit clears a shown error - it described the attempt, and the user is
  // now changing it.
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) reset();
  };

  const submit = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    // No navigation on success - see the component comment. On failure `error`
    // is already set.
    await register({ email, username, password, firstName, lastName });
  };

  // Back to login. A pop when login is underneath, which it is whenever this
  // screen was reached from there; a replace when it is not, e.g. a web link
  // straight to /register.
  const toLogin = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/login");
  };

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
          <View style={styles.heading}>
            <Text style={styles.headline}>Create your account</Text>
            <Text style={styles.subline}>
              Join stdy to start sharing study sessions.
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

          <View
            style={styles.or}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.orRule} />
            <Text style={styles.orLabel}>OR</Text>
            <View style={styles.orRule} />
          </View>

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
              returnKeyType="next"
              onSubmitEditing={() => usernameInput.current?.focus()}
              submitBehavior="submit"
              accessibilityLabel="Email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              ref={usernameInput}
              style={styles.input}
              value={username}
              onChangeText={edit(setUsername)}
              placeholder="sam_k"
              placeholderTextColor={colors.textMuted}
              maxLength={MAX_USERNAME_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="username"
              autoComplete="username-new"
              returnKeyType="next"
              onSubmitEditing={() => firstNameInput.current?.focus()}
              submitBehavior="submit"
              accessibilityLabel="Username"
            />
          </View>

          {/* Side by side: two short, optional fields read as one line item. */}
          <View style={own.nameRow}>
            <View style={own.nameField}>
              <Text style={styles.label}>
                First name <Text style={own.optional}>(optional)</Text>
              </Text>
              <TextInput
                ref={firstNameInput}
                style={styles.input}
                value={firstName}
                onChangeText={edit(setFirstName)}
                placeholder="Sam"
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_NAME_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="givenName"
                autoComplete="given-name"
                returnKeyType="next"
                onSubmitEditing={() => lastNameInput.current?.focus()}
                submitBehavior="submit"
                accessibilityLabel="First name, optional"
              />
            </View>

            <View style={own.nameField}>
              <Text style={styles.label}>
                Last name <Text style={own.optional}>(optional)</Text>
              </Text>
              <TextInput
                ref={lastNameInput}
                style={styles.input}
                value={lastName}
                onChangeText={edit(setLastName)}
                placeholder="Kim"
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_NAME_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="familyName"
                autoComplete="family-name"
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
                submitBehavior="submit"
                accessibilityLabel="Last name, optional"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                ref={passwordInput}
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
                accessibilityLabel="Password"
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
                  repeatMismatch && own.inputInvalid,
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
                onSubmitEditing={submit}
                accessibilityLabel="Repeat password"
              />
              {revealButton}
            </View>
          </View>

          <RegistrationChecks results={results} />

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
            accessibilityLabel="Register"
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
                <Text style={styles.submitLabel}>Register</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* One link, underlined end to end - the question is the way back. */}
          <View style={styles.signup}>
            <Pressable
              onPress={toLogin}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="Have an account? Log in"
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
                  Have an account? Log in!
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
};

export default Register;
