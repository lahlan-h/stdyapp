import { View, Text, Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
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
  /** Needed only to open the post - the counts come pre-joined. */
  postId: string;
  likeCount: number;
  commentCount: number;
  /** Whether the VIEWER has liked this post - the heart's fill and colour. */
  isLiked: boolean;
  onToggleLike: () => void;
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
const PostCardFooter = ({
  postId,
  likeCount,
  commentCount,
  isLiked,
  onToggleLike,
}: PostCardFooterProps) => {
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
      {/*
        The one action here that does something, so the one that is a Pressable
        rather than a View - see the report placeholder below for the other half
        of that rule.

        postCardAction sits ON the Pressable rather than inside it, so the count
        is part of the press target: the heart is 22px of glyph, and a row that
        only accepts a hit on the icon itself is a row people miss.

        accessibilityState.selected rather than a label that changes between
        "Like" and "Unlike": a screen reader then announces the heart's CURRENT
        state, which is the thing the colour is conveying to everyone else.
      */}
      <Pressable
        onPress={onToggleLike}
        accessibilityRole="button"
        accessibilityLabel="Like"
        accessibilityState={{ selected: isLiked }}
        style={({ pressed }) => [
          homeStyles.postCardAction,
          pressed && { opacity: 0.6 },
        ]}
      >
        <FontAwesome
          name={isLiked ? "heart" : "heart-o"}
          size={ICON_SIZE}
          color={isLiked ? colors.danger : colors.text}
        />
        <Text style={homeStyles.soft}>{likeCount}</Text>
      </Pressable>
      {/* The second way into the post, alongside tapping the card body. */}
      <Pressable
        onPress={() => router.push(`/post/${postId}`)}
        accessibilityRole="button"
        accessibilityLabel="Comments"
        style={({ pressed }) => [
          homeStyles.postCardAction,
          pressed && { opacity: 0.6 },
        ]}
      >
        <FontAwesome name="comment-o" size={ICON_SIZE} color={colors.text} />
        <Text style={homeStyles.soft}>{commentCount}</Text>
      </Pressable>
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
