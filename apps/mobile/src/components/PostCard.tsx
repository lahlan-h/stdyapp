import { Image, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { useTheme, useStyles } from "@theme";
import type { FeedPost } from "@data";

import PostCardHeader from "./PostCardHeader";
import PostCardBody from "./PostCardBody";
import PostCardStats from "./PostCardStats";
import PostCardFooter from "./PostCardFooter";

interface PostCardProps {
  post: FeedPost;
  /**
   * Fired by the heart. The card neither knows nor cares whether that is a like
   * or an unlike - useLikePost reads the post's current state and flips it, so
   * the two directions cannot drift apart into two props.
   */
  onToggleLike: () => void;
  /**
   * Fired by the flag. Opens the report dialog, which the SCREEN owns rather
   * than the card: a dialog rendered in here would be unmounted by FlatList the
   * moment its row scrolled out of the window, taking an open, mid-submit
   * report with it.
   */
  onReport: () => void;
}

/**
 * One post in the feed.
 *
 * Renders entirely from the `post` it is given and issues NO queries of its own.
 * It used to fetch its author, and its footer used to fetch the post's likes, so
 * a feed of N posts opened 2N+1 live subscriptions and each card appeared
 * separately as its author resolved. The author now arrives joined with the post
 * - see usePosts in src/data.
 */
const PostCard = ({ post, onToggleLike, onReport }: PostCardProps) => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");

  return (
    <LinearGradient
      style={homeStyles.postCardBackground}
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {/*
        Everything above the footer opens the post. The footer is deliberately
        OUTSIDE this Pressable rather than the whole gradient being wrapped:
        wrapping the gradient would swallow the like and report taps, which have
        to stay their own actions.
      */}
      <Pressable
        onPress={() => router.push(`/post/${post.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${post.title}`}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <PostCardHeader
          displayName={post.author.displayName}
          avatarUrl={post.author.avatarUrl}
          createdAt={post.createdAt}
        />
        <PostCardBody title={post.title} caption={post.caption} />
        {/* Always rendered. PostCardStats holds the row's place with a dash when
            a post has no linked session, rather than the row coming and going. */}
        <PostCardStats session={post.session} />
        {post.imageUrl && (
          <Image
            style={homeStyles.postCardImage}
            source={{ uri: post.imageUrl }}
            resizeMode="cover"
          />
        )}
      </Pressable>
      <PostCardFooter
        postId={post.id}
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        isLiked={post.isLiked}
        onToggleLike={onToggleLike}
        isReported={post.isReported}
        onReport={onReport}
        isMine={post.isMine}
      />
    </LinearGradient>
  );
};

export default PostCard;
