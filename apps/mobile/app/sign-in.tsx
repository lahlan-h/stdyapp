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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useAccountStyles } from "@theme";
import { signIn, signInAsDev, describeSignInError } from "@data";

/**
 * Where a signed-out user lands.
 *
 * No navigation happens here on success: the root layout's guard sees the
 * session change and swaps this screen for the tabs by itself.
 *
 * There is no sign-up form yet. POST /api/auth/register exists, so an account
 * can be made from Postman until one is built.
 */
const SignIn = () => {
  const { colors } = useTheme();
  const styles = useAccountStyles();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "dev" | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !busy;

  const run = async (kind: "password" | "dev") => {
    setBusy(kind);
    setError(undefined);
    try {
      if (kind === "password") await signIn(identifier, password);
      else await signInAsDev();
    } catch (err) {
      setError(describeSignInError(err, kind));
      setBusy(null);
    }
    // Not reset on success: this screen is unmounting.
  };

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, styles.centred]}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text style={styles.screenTitle}>Sign in</Text>
              <Text style={styles.subtitle}>Set goals, find friends, see results.</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email or username</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                accessibilityLabel="Email or username"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && run("password")}
                accessibilityLabel="Password"
              />
            </View>

            {error ? (
              <View style={styles.error}>
                <Feather name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => run("password")}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy: busy === "password" }}
            >
              <LinearGradient
                colors={colors.gradients.primary}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.submitFill}
              >
                {busy === "password" ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitLabel}>Sign in</Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* The shared dev_local account. The API only serves it in
                development, so the button is not built into release bundles. */}
            {__DEV__ ? (
              <Pressable
                onPress={() => run("dev")}
                disabled={Boolean(busy)}
                style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Continue with the dev account"
              >
                {busy === "dev" ? (
                  <ActivityIndicator color={colors.textMuted} />
                ) : (
                  <Text style={styles.secondaryLabel}>Continue with dev account</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SignIn;