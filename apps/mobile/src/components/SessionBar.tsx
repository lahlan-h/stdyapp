import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useTabBarStyles, SESSION_BAR_CLEARANCE, SESSION_BAR_ICON_SIZE } from "@theme";
import { useFocusSession, useIsSessionRunning } from "@data";

import { confirmDiscardSession } from "./confirmDiscardSession";
import { formatClock } from "./sessionFormat";

interface SessionBarProps {
  /** Takes the user to the session itself - the Study tab. */
  onExpand: () => void;
}

/**
 * The session in progress, riding above the tab bar on every tab but Study -
 * the bar Hevy shows for a workout. It says a session is running and for how
 * long, opens it, and throws it away; ending it happens on the Study tab,
 * where the session's own controls are.
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
export const useSessionBarClearance = (): number =>
  useIsSessionRunning() ? SESSION_BAR_CLEARANCE : 0;

export default SessionBar;
