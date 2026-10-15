import { Stack } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { ThemeProvider } from "@theme";
import { useChoosingPlan, useIsSignedIn, useSessionRestored } from "@data";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const signedIn = useIsSignedIn();
  // A brand-new account picks a plan before anything else - see choose-plan.
  const choosingPlan = useChoosingPlan();
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
            guard and lands on choose-plan with no navigation of its own.
          */}
          <Stack.Screen name="register" />
          {/* Signed-out only too: it is how you get back to logging in. */}
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>

        {/*
          Straight after creating an account, and nothing else then: the guard
          below is closed while this one is open, so a new user cannot skip
          past it by any path. Picking a plan flips both, and the app lands on
          the feed with no navigation, exactly as signing in does.
        */}
        <Stack.Protected guard={signedIn && choosingPlan}>
          <Stack.Screen name="choose-plan" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !choosingPlan}>
          <Stack.Screen name="(tabs)" />
          {/*
            A modal, not a tab: composing a post is something you finish or
            abandon, which is also why the screen carries its own discard button
            rather than relying on a back arrow. No swipe-down either: for a
            session that just ended, leaving without posting deletes it, and
            that has to be a deliberate tap, never a stray drag.
          */}
          <Stack.Screen
            name="new-post"
            options={{ presentation: "modal", gestureEnabled: false }}
          />
          {/*
            A push, not a modal: reading a post and its thread is somewhere you
            go and come back from, where composing is finish-or-abandon. It still
            ships its own exit, because the root Stack hides every header.
          */}
          <Stack.Screen name="post/[id]" />
          {/* A push, for post/[id]'s reason: you go there and come back. */}
          <Stack.Screen name="edit-profile" />
          {/* A push from the gear on your own profile, for the same reason. */}
          <Stack.Screen name="settings" />
          {/*
            A push, for the same reason - opened from the Study tab's Routines
            view. The routines list itself lives under Study.
          */}
          <Stack.Screen name="routine/[id]" />
          {/*
            Someone else's routine, read only, from the chip on their post -
            a push for the same reason, with Save to my routines on it.
          */}
          <Stack.Screen name="routine-preview/[id]" />
          {/* The full analytics page, a push from the Study tab's weekly card. */}
          <Stack.Screen name="analytics" />
          {/* A push from the Study tab's Groups view, for routine/[id]'s reason. */}
          <Stack.Screen name="group/[id]" />
          {/*
            Someone else's profile, opened from the home screen's search. A
            push over the tabs, so the way back returns to the feed exactly as
            it was left.
          */}
          <Stack.Screen name="user/[id]" />
          {/*
            Session history, opened from the profile, and one session's
            recap-style detail opened from it. Pushes, for post/[id]'s reason.
          */}
          <Stack.Screen name="sessions" />
          <Stack.Screen name="session/[id]" />
          {/* A push from the Analytics header, for post/[id]'s reason. */}
          <Stack.Screen name="leaderboard" />
          {/*
            Manage subscription, from Settings - a push, for edit-profile's
            reason. Also where Stripe Checkout returns to on web.
          */}
          <Stack.Screen name="plans" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}