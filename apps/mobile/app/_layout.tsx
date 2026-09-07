import { StackScreen } from "expo-router/build/layouts/stack-utils";
import { ThemeProvider } from "@hooks/useTheme";
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <StackScreen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
