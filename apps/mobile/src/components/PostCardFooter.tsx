import { View, Text, Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";

import { useTheme, useHomeStyles } from "@theme";

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
  /**
   * Whether the VIEWER has reported this post - the flag's fill and colour.
   *
   * Note what has no counterpart here: there is no reportCount beside it the
   * way likeCount sits beside isLiked, and there is not going to be one. A
   * report count would tell a post's author they had been reported.
   */
  isReported: boolean;
  onReport: () => void;
  /**
   * Whether the VIEWER wrote this post - if so, no flag is drawn at all.
   *
   * A prop rather than an absent onReport, so the reason is legible where the
   * card is assembled instead of being inferred from a missing handler.
   */
  isMine: boolean;
}

/**
 * Reads the counts off the post rather than fetching the rows to measure their
 * length. Both are already denormalized onto it - likeCount and commentCount
 * come from the API's _count - and the old per-card query was half of the
 * feed's N+1 problem.
 *
 * The glyphs come from FontAwesome v4 rather than Feather, which is the family
 * used more widely in this app. Feather is a stroked set, and its bubble
 * sitting next to this outline heart reads as two different icon languages in
 * one row. Matching the neighbour beats matching the app-wide count.
 *
 * Two of the three are always drawn; the flag is not - see below.
 */
const PostCardFooter = ({
  postId,
  likeCount,
  commentCount,
  isLiked,
  onToggleLike,
  isReported,
  onReport,
  isMine,
}: PostCardFooterProps) => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.postCardFooter}>
      {/*
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
        The odd one out in this row twice over. It is the only action with no
        count beside it - a report count on a post would tell its author they
        had been reported, so the fill of this glyph, visible to the reporter
        alone, is the whole of what the feature shows. And it is the only one
        that can be absent: the API refuses a self-report, so drawing a flag on
        your own post would offer a tap whose only outcome is an error.

        GONE rather than dimmed, which is the rule SettingsRow states: a
        disabled control says "not now", and this one is "not ever". There is
        nothing the author could do to make it work.

        Otherwise it follows the heart exactly: outline to solid, colors.text to
        colors.danger, and accessibilityState.selected rather than a label that
        flips between "Report" and "Reported", so a screen reader announces the
        state the colour is conveying to everyone else.
      */}
      {isMine ? null : (
        <Pressable
          onPress={onReport}
          accessibilityRole="button"
          accessibilityLabel="Report"
          accessibilityState={{ selected: isReported }}
          style={({ pressed }) => [
            homeStyles.postCardAction,
            pressed && { opacity: 0.6 },
          ]}
        >
          <FontAwesome
            name={isReported ? "flag" : "flag-o"}
            size={ICON_SIZE}
            color={isReported ? colors.danger : colors.text}
          />
        </Pressable>
      )}
    </View>
  );
};

export default PostCardFooter;
