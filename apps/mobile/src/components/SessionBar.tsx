import { View, Text, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useTabBarStyles, SESSION_BAR_CLEARANCE, SESSION_BAR_ICON_SIZE } from "@theme";
import { useFocusSession, useIsSessionRunning } from "@data";

import { confirmDiscardSession } from "./confirmDiscardSession";
import { formatClock } from "./sessionFormat";

/**
 * Whether the native tab bar has iOS 26's bottom accessory slot. Where it
 * does, the session shows there (SessionAccessory); everywhere else, this bar
 * floats over the tab bar instead.
 */
export const SUPPORTS_BOTTOM_ACCESSORY =
  Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;

interface SessionBarProps {
  /** Takes the user to the session itself - the Study tab. */
  onExpand: () => void;
}

/**
 * The session in progress, floating over the tab bar on every tab but Study -
 * the bar Hevy shows for a workout. It says a session is running and for how
 * long, opens it, and throws it away; ending it happens on the Study tab,
 * where the session's own controls are.
 *
 * The fallback for platforms without the native accessory slot - on iOS 26
 * SessionAccessory shows the same session in the tab bar's glass instead.
 *
 * Its own component, reading the full session state, so the once-a-second
 * clock re-renders this and nothing else.
 */
const SessionBar = ({ onExpand }: SessionBarProps) => {
  const { colors } = useTheme();
  const styles = useTabBarStyles();
  const { elapsedSec, activeGroup, busy, discard } = useFocusSession();

  const clock = formatClock(elapsedSec);

  return (
    <View style={styles.sessionBar}>
      <LinearGradient
        colors={colors.gradients.primary}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.sessionBarFill}
      />

      {/* Two sibling buttons rather than the bin inside a pressable bar: a
          button inside a button is invalid on the web, and ambiguous to a
          screen reader everywhere. */}
      <Pressable
        style={({ pressed }) => [styles.sessionBarOpen, pressed && { opacity: 0.8 }]}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`Study session running, ${clock}. Open it.`}
      >
        <View style={styles.sessionBarButton}>
          <Feather name="chevron-up" size={SESSION_BAR_ICON_SIZE} color="#ffffff" />
        </View>

        <View style={styles.sessionBarText}>
          <View style={styles.sessionBarTitleRow}>
            <View style={styles.sessionBarDot} />
            <Text style={styles.sessionBarTitle}>Studying {clock}</Text>
          </View>
          <Text style={styles.sessionBarCaption} numberOfLines={1}>
            {activeGroup?.name ?? "Normal / Unlimited"}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.sessionBarButton, pressed && { opacity: 0.6 }]}
        onPress={() => confirmDiscardSession(discard)}
        disabled={busy}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Discard session"
      >
        <Feather name="trash-2" size={SESSION_BAR_ICON_SIZE} color={colors.danger} />
      </Pressable>
    </View>
  );
};

/**
 * What a scrolling screen adds to useTabBarClearance() so its last row can
 * scroll out from under the session bar too. Zero when no session runs.
 *
 * Lives with the bar rather than in the theme, because the answer depends on
 * the session - which the theme layer has no business knowing about.
 */
export const useSessionBarClearance = (): number => {
  const running = useIsSessionRunning();
  // The accessory is part of the native bar, which insets the content itself.
  return running && !SUPPORTS_BOTTOM_ACCESSORY ? SESSION_BAR_CLEARANCE : 0;
};

export default SessionBar;
