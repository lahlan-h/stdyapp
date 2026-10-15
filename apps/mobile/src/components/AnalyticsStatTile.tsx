import { View, Text } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";

import { useTheme, useStyles, ANALYTICS_ICON_SIZE } from "@theme";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

interface AnalyticsStatTileProps {
  icon: FeatherIconName;
  label: string;
  /** Already formatted. A dash for "nothing to measure", never a fake 0. */
  value: string;
  /** One line of context under the value. */
  detail?: string;
}

/**
 * One headline number. Half the width of the screen, so tiles pair up.
 *
 * The icon is muted rather than coloured: it labels WHAT the number is, and
 * colour on this screen is reserved for the data itself.
 */
const AnalyticsStatTile = ({ icon, label, value, detail }: AnalyticsStatTileProps) => {
  const { colors } = useTheme();
  const styles = useStyles("analytics");

  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}. ${detail ?? ""}`}>
      <View style={styles.tileHeader}>
        <Feather name={icon} size={ANALYTICS_ICON_SIZE} color={colors.textMuted} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      {detail ? <Text style={styles.tileDetail}>{detail}</Text> : null}
    </View>
  );
};

export default AnalyticsStatTile;
