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
      </Stack>
    </ThemeProvider>
  );
}
