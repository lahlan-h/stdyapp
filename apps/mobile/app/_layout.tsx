import { Stack } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { ThemeProvider } from "@theme";
import { useIsSignedIn, useSessionRestored } from "@data";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const signedIn = useIsSignedIn();
  // A remembered session is still being restored. Rendering the guards now
  // would put login on screen for the moment before the feed replaces it, so
  // wait - one refresh round trip at most, alongside the fonts.
  const restored = useSessionRestored();

  if (!fontsLoaded || !restored) return null;

  return (
    <ThemeProvider>
      {/*
        The session decides which half of the app exists. Guarded routes are
        not merely hidden: while a guard is false its screens cannot be reached
        by any path, a web deep link to /post/123 included, and expo-router
        moves to the first screen that can be. So opening the app signed out
        lands on login, signing in lands on the feed, and a refresh the server
        rejects puts the user back at login - all without a router.replace
        anywhere.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
          {/*
            Signed-out only, like login. Registering signs in, which flips the
            guard and lands on the feed with no navigation of its own.
          */}
          <Stack.Screen name="register" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn}>
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
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
