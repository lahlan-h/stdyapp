import { View, Text, Pressable } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useTabBarStyles, SESSION_BAR_ICON_SIZE } from "@theme";
import { useFocusSession } from "@data";

import { confirmDiscardSession } from "./confirmDiscardSession";
import { formatClock } from "./sessionFormat";

interface SessionAccessoryProps {
  /** Takes the user to the session itself - the Study tab. */
  onExpand: () => void;
}

/**
 * The running session in the native tab bar's bottom accessory: the slot iOS 26
 * gives a mini player, drawn in the bar's own Liquid Glass. So this draws no
 * background of its own - only what sits on the glass.
 *
 * iOS renders it twice, once above the bar ("regular") and once beside the bar
 * when it shrinks on scroll ("inline"), and shows whichever fits. Everything
 * shown comes from the shared session, never local state, so the two copies
 * can never disagree - see NativeTabs.BottomAccessory.usePlacement.
 */
const SessionAccessory = ({ onExpand }: SessionAccessoryProps) => {
  const { colors } = useTheme();
  const styles = useTabBarStyles();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const { elapsedSec, activeGroup, busy, discard } = useFocusSession();

  const clock = formatClock(elapsedSec);
  const label = `Study session running, ${clock}. Open it.`;

  // Beside a shrunken bar there is room for the clock and nothing else.
  if (placement === "inline") {
    return (
      <Pressable
        style={styles.accessoryInline}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.sessionBarDot} />
        <Text style={styles.accessoryTitle}>{clock}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.accessory}>
      <Pressable
        style={styles.accessoryOpen}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.sessionBarDot} />
        <View style={styles.sessionBarText}>
          <Text style={styles.accessoryTitle}>Studying {clock}</Text>
          <Text style={styles.accessoryCaption} numberOfLines={1}>
            {activeGroup?.name ?? "Normal / Unlimited"}
          </Text>
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.accessoryButton, pressed && { opacity: 0.6 }]}
        onPress={() => confirmDiscardSession(discard)}
        disabled={busy}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Discard session"
      >
        <Feather name="trash-2" size={SESSION_BAR_ICON_SIZE} color={colors.danger} />
      </Pressable>
    </View>
  );
};

export default SessionAccessory;
