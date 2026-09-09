import { ConvexProvider } from "convex/react";
import { Stack } from "expo-router";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import { createConvexClient } from "@stdyapp/convex-stub";
import { ThemeProvider } from "@theme";

/**
 * Fail with a message that names the variable.
 *
 * This was a non-null assertion, so a missing value surfaced as an opaque crash
 * from inside the Convex client at module load, with nothing pointing at the
 * cause. It also used to be logged to the console on every launch, which put the
 * backend URL in the device log for no benefit.
 */
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. Copy .env.example to .env at the repo " +
      "root and set it, then restart the bundler with `npm run dev -w @stdyapp/mobile`.",
  );
}

const convex = createConvexClient(convexUrl);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <ConvexProvider client={convex}>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </ConvexProvider>
  );
}
