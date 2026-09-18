import { View, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ComponentProps } from "react";

import { useTheme, useHomeStyles } from "@theme";

/**
 * Typed against FontAwesome's own name union, so a typo in a glyph name is a
 * compile error rather than a blank space on the card at runtime.
 */
type FontAwesomeIconName = ComponentProps<typeof FontAwesome>["name"];

/** Matches the outline weight the heart has always used. */
const ICON_SIZE = 22;

interface PostCardFooterProps {
  likeCount: number;
  commentCount: number;
}

/**
 * Reads the counts off the post rather than fetching the rows to measure their
 * length. Both are already denormalized onto it - likeCount and commentCount
 * come from the API's _count - and the old per-card query was half of the
 * feed's N+1 problem.
 *
 * All three glyphs come from FontAwesome v4 rather than Feather, which is the
 * family used more widely in this app. Feather is a stroked set, and its bubble
 * sitting next to this outline heart reads as two different icon languages in
 * one row. Matching the neighbour beats matching the app-wide count.
 */
const PostCardFooter = ({ likeCount, commentCount }: PostCardFooterProps) => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();

  const action = (icon: FontAwesomeIconName, count?: number) => (
    <View style={homeStyles.postCardAction}>
      <FontAwesome name={icon} size={ICON_SIZE} color={colors.text} />
      {count === undefined ? null : (
        <Text style={homeStyles.soft}>{count}</Text>
      )}
    </View>
  );

  return (
    <View style={homeStyles.postCardFooter}>
      {action("heart-o", likeCount)}
      {action("comment-o", commentCount)}
      {/*
        A placeholder. Nothing calls the report API from the app yet, so this is
        a plain View rather than a Pressable - the rule SettingsRow follows, so
        a screen reader does not announce a button that does nothing. Drawn at
        full strength because a dimmed icon would read as a disabled action
        rather than an unbuilt one. Give it an onPress when the flow lands.
      */}
      {action("flag-o")}
    </View>
  );
};

export default PostCardFooter;
