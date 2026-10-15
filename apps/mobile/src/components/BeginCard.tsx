import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, BEGIN_CHEVRON_SIZE } from "@theme";

interface BeginCardProps {
  /** A start is already in flight - the row says so and ignores more taps. */
  busy: boolean;
  /** Starts an open-ended session: a stopwatch that counts up until End. */
  onStartNormal: () => void;
}

/**
 * How a session starts: pick a mode and the clock is running. No setup screen
 * in between - the stopwatch is the whole of Normal mode.
 *
 * Pomodoro is drawn but inert, marked SOON the way the composer marks its
 * unbuilt rows, so nobody mistakes it for a broken button. It needs work and
 * break phases that a session does not model yet, and is left for a change of
 * its own.
 */
const BeginCard = ({ busy, onStartNormal }: BeginCardProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");

  return (
    <LinearGradient
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.beginCard}
    >
      <Text style={styles.beginTitle}>Begin</Text>

      <Pressable
        style={({ pressed }) => [
          styles.beginOption,
          styles.beginOptionPrimary,
          (pressed || busy) && { opacity: 0.7 },
        ]}
        onPress={onStartNormal}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Start a normal session with no time limit"
        accessibilityState={{ disabled: busy, busy }}
      >
        <View style={styles.beginOptionText}>
          <Text style={styles.beginOptionTitle}>Normal / Unlimited</Text>
          <Text style={styles.beginOptionCaption}>
            Track study hours freely, no interruptions
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <Feather name="chevron-right" size={BEGIN_CHEVRON_SIZE} color={colors.textMuted} />
        )}
      </Pressable>

      <View
        style={[styles.beginOption, styles.beginOptionDisabled]}
        accessible
        accessibilityLabel="Pomodoro mode, coming soon"
      >
        <View style={styles.beginOptionText}>
          <Text style={styles.beginOptionTitle}>Pomodoro Mode</Text>
          <Text style={styles.beginOptionCaption}>Study intervals with scheduled breaks</Text>
        </View>
        <View style={styles.beginBadge}>
          <Text style={styles.beginBadgeText}>SOON</Text>
        </View>
      </View>
    </LinearGradient>
  );
};

export default BeginCard;
