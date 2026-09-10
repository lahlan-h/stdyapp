import { View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { useTheme, useHomeStyles } from "@theme";

interface PostCardFooterProps {
  likeCount: number;
}

/**
 * Reads the count off the post rather than fetching the like rows to measure
 * their length. likeCount is already denormalized onto the post, and the old
 * per-card query was half of the feed's N+1 problem.
 */
const PostCardFooter = ({ likeCount }: PostCardFooterProps) => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.postCardFooter}>
      <FontAwesome name="heart-o" size={22} color={colors.text} />
      <Text style={homeStyles.soft}>{likeCount}</Text>
    </View>
  );
};

export default PostCardFooter;
