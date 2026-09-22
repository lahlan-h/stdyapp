import { View, Text, Pressable, StatusBar, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme } from "@theme";

/**
 * PLACEHOLDER. Where sign-out lands until the auth flow's sign-in screen
 * exists, so the effect of signing out can be seen.
 *
 * Replace or delete this with the auth flow: the root layout's onSignOut
 * handler is the one line that sends the user here.
 *
 * Styles are local rather than in a theme file because this screen is
 * temporary - a stylesheet in src/theme would outlive it.
 */
const SignedOut = () => {
  const { colors } = useTheme();

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.content}>
        <Feather name="log-out" size={40} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.text }]}>You're signed out</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Sign-in is coming soon.
        </Text>

        {/*
          Dev-only way back, so testing sign-out does not mean restarting the
          app. The next request mints a fresh dev token, as it always has.
        */}
        <Pressable
          onPress={() => router.replace("/")}
          style={({ pressed }) => [
            styles.button,
            { borderColor: colors.border },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Back to the app"
        >
          <Text style={[styles.buttonLabel, { color: colors.textMuted }]}>Back to the app</Text>
        </Pressable>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 24,
  },
  body: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    textAlign: "center",
  },
  button: {
    marginTop: 12,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 15,
  },
});

export default SignedOut;