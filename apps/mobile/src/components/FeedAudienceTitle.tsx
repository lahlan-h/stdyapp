import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, PANEL_TITLE_ICON_SIZE } from "@theme";
import type { FeedAudience } from "@data";

interface FeedAudienceTitleProps {
  audience: FeedAudience;
  /** The menu is showing, so the arrow flips to say a tap will close it. */
  open: boolean;
  onPress: () => void;
}

/** What the title reads for each audience. A group is named, not "Group". */
const titleOf = (audience: FeedAudience): string => {
  switch (audience.kind) {
    case "following":
      return "Following";
    case "everyone":
      return "Everyone";
    case "group":
      return audience.groupName;
  }
};

/**
 * The feed's title, and the way to change whose posts it shows: the design's
 * "Home" with its circled arrow, reading as the audience on screen so the
 * feed always says what it is a feed of.
 */
const FeedAudienceTitle = ({ audience, open, onPress }: FeedAudienceTitleProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const title = titleOf(audience);

  return (
    <View style={styles.panelTitleRow}>
      <Pressable
        style={({ pressed }) => [styles.panelTitle, pressed && { opacity: 0.6 }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${title}. Change whose posts you see`}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.panelTitleText} numberOfLines={1}>
          {title}
        </Text>
        <Feather
          name={open ? "arrow-up-circle" : "arrow-down-circle"}
          size={PANEL_TITLE_ICON_SIZE}
          color={colors.text}
        />
      </Pressable>
    </View>
  );
};

export default FeedAudienceTitle;
