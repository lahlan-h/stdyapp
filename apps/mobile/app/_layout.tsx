import { Stack } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { ThemeProvider } from "@theme";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

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
      </Stack>
    </ThemeProvider>
  );
}
