import { Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme, useHomeStyles } from "@theme";
import type { FeedPost } from "@data";

import PostCardHeader from "./PostCardHeader";
import PostCardBody from "./PostCardBody";
import PostCardStats from "./PostCardStats";
import PostCardFooter from "./PostCardFooter";

interface PostCardProps {
  post: FeedPost;
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
const PostCard = ({ post }: PostCardProps) => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();

  return (
    <LinearGradient
      style={homeStyles.postCardBackground}
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <PostCardHeader
        displayName={post.author.displayName}
        avatarUrl={post.author.avatarUrl}
        createdAt={post.createdAt}
      />
      <PostCardBody title={post.title} caption={post.caption} />
      <PostCardStats durationMinutes={post.durationMinutes} goalsHit={post.goalsHit} />
      {post.imageUrl && (
        <Image
          style={homeStyles.postCardImage}
          source={{ uri: post.imageUrl }}
          resizeMode="cover"
        />
      )}
      <PostCardFooter likeCount={post.likeCount} />
    </LinearGradient>
  );
};

export default PostCard;
