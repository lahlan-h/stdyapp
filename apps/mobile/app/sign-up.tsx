import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useAccountStyles, ACCOUNT_BACK_ICON_SIZE } from "@theme";
import {
  signUp,
  describeSignInError,
  MAX_NAME_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  type NewAccount,
} from "@data";

type Field = keyof NewAccount;

const EMPTY: NewAccount = {
  firstName: "",
  lastName: "",
  email: "",
  username: "",
  password: "",
};

/**
 * What is wrong with each field, mirroring registerSchema.
 *
 * A loose email check only: the API's z.email() is the real rule, and a strict
 * copy here would drift from it. The byte check matters because bcrypt ignores
 * everything past 72 BYTES, and the API refuses such a password with a 400.
 */
const validate = (form: NewAccount): Partial<Record<Field, string>> => {
  const errors: Partial<Record<Field, string>> = {};

  if (!form.firstName.trim()) errors.firstName = "Required.";
  if (!form.lastName.trim()) errors.lastName = "Required.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Enter a valid email.";

  const username = form.username.trim();
  if (username.length < MIN_USERNAME_LENGTH) {
    errors.username = `At least ${MIN_USERNAME_LENGTH} characters.`;
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = "Letters, numbers and underscores only.";
  }

  if (form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `At least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (new TextEncoder().encode(form.password).length > MAX_PASSWORD_BYTES) {
    errors.password = "That password is too long.";
  }

  return errors;
};

/**
 * Creates an account. Like sign-in, it never navigates on success: the API
 * logs the new account straight in, and the root layout's guard swaps this
 * screen for the tabs.
 */
const SignUp = () => {
  const { colors } = useTheme();
  const styles = useAccountStyles();
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState<NewAccount>(EMPTY);
  // Errors show per field only once that field has been left, so a blank form
  // does not open as a wall of red.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const errors = validate(form);
  const canSubmit = Object.keys(errors).length === 0 && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      await signUp(form);
      // Not reset on success: this screen is unmounting.
    } catch (err) {
      setError(describeSignInError(err, "register"));
      setIsSubmitting(false);
    }
  };

  const field = (key: Field, label: string, extra: TextInputProps = {}) => {
    const fieldError = touched[key] ? errors[key] : undefined;
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TextInput
          style={[styles.input, !!fieldError && styles.inputInvalid]}
          value={form[key]}
          onChangeText={(value) => {
            setError(undefined);
            setForm((current) => ({ ...current, [key]: value }));
          }}
          onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          {...extra}
        />
        {fieldError ? <Text style={[styles.hint, styles.hintInvalid]}>{fieldError}</Text> : null}
      </View>
    );
  };

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable
                style={styles.back}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Feather name="chevron-left" size={ACCOUNT_BACK_ICON_SIZE} color={colors.text} />
              </Pressable>
              <Text style={styles.screenTitle}>Create account</Text>
            </View>

            {field("firstName", "First name", {
              maxLength: MAX_NAME_LENGTH,
              autoComplete: "given-name",
              textContentType: "givenName",
            })}
            {field("lastName", "Last name", {
              maxLength: MAX_NAME_LENGTH,
              autoComplete: "family-name",
              textContentType: "familyName",
            })}
            {field("email", "Email", {
              autoCapitalize: "none",
              autoCorrect: false,
              keyboardType: "email-address",
              autoComplete: "email",
              textContentType: "emailAddress",
            })}
            {field("username", "Username", {
              maxLength: MAX_USERNAME_LENGTH,
              autoCapitalize: "none",
              autoCorrect: false,
              autoComplete: "username-new",
              textContentType: "username",
            })}
            {field("password", "Password", {
              secureTextEntry: true,
              autoComplete: "new-password",
              textContentType: "newPassword",
            })}
            <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</Text>

            {error ? (
              <View style={styles.error}>
                <Feather name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create account"
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
                  <Text style={styles.submitLabel}>Create account</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SignUp;