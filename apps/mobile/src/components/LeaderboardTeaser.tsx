import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme, useStyles, LEADERBOARD_MEDALS } from "@theme";
import { useLeaderboard } from "@data";

import { describeStanding, formatValue } from "@components/leaderboardFormat";

/**
 * The way into the leaderboard, on Analytics.
 *
 * A card with your live standing rather than an icon button: "#2 among friends
 * · 6m behind Sam" is something worth tapping, where a trophy glyph in a corner
 * was easy to miss. It sits in the same card language as the tiles around it,
 * so it is discoverable without shouting.
 */
const LeaderboardTeaser = () => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");
  const { board } = useLeaderboard("weightedMinutes", "week");

  let title = "Leaderboard";
  let detail = "See how your week compares";
  if (board) {
    const standing = describeStanding(board);
    if (board.followingCount === 0) {
      detail = "Follow classmates to compare study time";
    } else if (board.me.rank !== null) {
      title = `#${board.me.rank} among friends this week`;
      detail = `${formatValue("weightedMinutes", board.me.value).value} focus time · ${standing.gapText}`;
    } else {
      detail = standing.gapText;
    }
  }

  return (
    <Pressable
      onPress={() => router.push("/leaderboard")}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}. Opens the leaderboard.`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <LinearGradient
        colors={[`${LEADERBOARD_MEDALS[1]}1F`, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.teaser}
      >
        <View style={styles.teaserBadge}>
          <MaterialCommunityIcons name="trophy" size={20} color={LEADERBOARD_MEDALS[1]} />
        </View>
        <View style={styles.teaserText}>
          <Text style={styles.teaserTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.teaserDetail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </LinearGradient>
    </Pressable>
  );
};

export default LeaderboardTeaser;
