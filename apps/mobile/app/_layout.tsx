import { useEffect } from "react";
import { Stack, router } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { ThemeProvider } from "@theme";
import { onSignOut } from "@data";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // PLACEHOLDER until the auth flow lands: its guard decides where a
  // signed-out user goes, and replaces this effect. replace, not push, so the
  // back gesture cannot return to the signed-in tabs.
  useEffect(() => onSignOut(() => router.replace("/signed-out")), []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/*
          A modal, not a tab: composing a post is something you finish or
          abandon, which is also why the screen carries its own discard button
          rather than relying on a back arrow.
        */}
        <Stack.Screen name="new-post" options={{ presentation: "modal" }} />
        {/*
          A push, not a modal: reading a post and its thread is somewhere you
          go and come back from, where composing is finish-or-abandon. It still
          ships its own exit, because the root Stack hides every header.
        */}
        <Stack.Screen name="post/[id]" />
        {/* A push, for post/[id]'s reason: you go there and come back. */}
        <Stack.Screen name="edit-profile" />
        {/* PLACEHOLDER landing for sign-out. No swipe back into the app. */}
        <Stack.Screen name="signed-out" options={{ gestureEnabled: false }} />
      </Stack>
    </ThemeProvider>
  );
}