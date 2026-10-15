import { Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, ADVANCED_ANALYTICS_ICON_SIZE } from "@theme";

/**
 * The way from the weekly card to the full analytics page.
 *
 * The lock is the design's, kept as drawn: advanced analytics is expected to
 * be a paid feature. Nothing is gated yet, so the row opens the page for
 * everyone until subscriptions decide otherwise.
 */
const AdvancedAnalyticsRow = () => {
  const { colors } = useTheme();
  const styles = useStyles("study");

  return (
    <Pressable
      onPress={() => router.push("/analytics")}
      accessibilityRole="button"
      accessibilityLabel="See advanced analytics"
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <LinearGradient
        colors={colors.gradients.surface}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.advancedRow}
      >
        <Feather name="bar-chart-2" size={ADVANCED_ANALYTICS_ICON_SIZE} color={colors.text} />
        <Text style={styles.advancedLabel}>See Advanced Analytics</Text>
        <Feather name="lock" size={ADVANCED_ANALYTICS_ICON_SIZE} color={colors.text} />
      </LinearGradient>
    </Pressable>
  );
};

export default AdvancedAnalyticsRow;
