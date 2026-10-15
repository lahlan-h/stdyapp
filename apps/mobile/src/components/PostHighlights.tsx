import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";

import { useTheme, useStyles, type ColorScheme } from "@theme";
import type { PostHighlight } from "@data";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

interface PostHighlightsProps {
  highlights: PostHighlight[];
  /** Spacing from the surrounding card, which differs between feed and detail. */
  style?: StyleProp<ViewStyle>;
}

/** The words, icon and icon colour for each badge. */
const describe = (
  highlight: PostHighlight,
  colors: ColorScheme,
): { label: string; icon: FeatherIconName; color: string } => {
  switch (highlight.kind) {
    case "personalBest":
      return { label: "Personal best", icon: "award", color: colors.warning };
    case "hitPlan":
      return {
        label: `Hit the ${highlight.plannedMinutes}-min plan`,
        icon: "target",
        color: colors.primary,
      };
    case "phoneFree":
      return { label: "Phone-free", icon: "smartphone", color: colors.success };
  }
};

/**
 * The badges a session earned - "Personal best", "Hit the 50-min plan",
 * "Phone-free" - as small chips under a post's numbers.
 *
 * Earned, never filled in: the row is absent on most posts, so a badge stays
 * worth noticing and worth a like when one does turn up. Who earned what is
 * decided by the API (services/postSession.js); this only draws it.
 */
const PostHighlights = ({ highlights, style }: PostHighlightsProps) => {
  const { colors } = useTheme();
  const styles = useStyles("home");
  if (highlights.length === 0) return null;

  return (
    <View style={[styles.highlights, style]}>
      {highlights.map((highlight) => {
        const { label, icon, color } = describe(highlight, colors);
        return (
          <View key={highlight.kind} style={styles.highlight} accessibilityLabel={label}>
            <Feather name={icon} size={13} color={color} />
            <Text style={styles.highlightText}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default PostHighlights;
