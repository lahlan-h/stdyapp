import { useEffect } from "react";
import { Stack } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { ThemeProvider } from "@theme";
import { useAuth, restoreSession } from "@data";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const auth = useAuth();

  useEffect(() => {
    restoreSession();
  }, []);

  // Held until the saved session is read, so a signed-in user never sees the
  // sign-in screen flash up first.
  if (!fontsLoaded || auth.status === "loading") return null;

  const isSignedIn = auth.status === "signedIn";

  return (
    <ThemeProvider>
      {/*
        The guards ARE the auth routing. Signing in or out flips isSignedIn,
        and the Stack drops the screens that no longer apply and lands on the
        first one that does - no screen navigates after sign-in or sign-out.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isSignedIn}>
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
        </Stack.Protected>

        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}