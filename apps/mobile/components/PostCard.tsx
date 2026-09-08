import { createHomeStyles } from "assets/styles/home.styles";
import { LinearGradient } from "expo-linear-gradient";
import useTheme from "@hooks/useTheme";
import { Image } from "react-native";

import { api, Doc } from "@stdyapp/core";
import { useQuery } from "convex/react";

import PostCardHeader from "./PostCardHeader";
import PostCardBody from "./PostCardBody";
import PostCardStats from "./PostCardStats";
import PostCardFooter from "./PostCardFooter";

type User = Doc<"users">;

interface PostCardProps {
  post: Doc<"posts">;
}

const PostCard = ({ post }: PostCardProps) => {
  const { colors } = useTheme();
  const homeStyles = createHomeStyles(colors);
  const author = useQuery(api.users.getUser, { userId: post.authorId });
  if (!author) return null;

  return (
    <LinearGradient
      style={homeStyles.postCardBackground}
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <PostCardHeader
        displayName={author.displayName}
        username={author.username}
        avatarUrl={author.avatarUrl}
        createdAt={post._creationTime}
      />
      <PostCardBody title={post.title} caption={post.caption} />
      <PostCardStats durationMinutes={post.durationMinutes} goalsHit={post.goalsHit} />
      {/* Logic for whether to add an image or not ... */}
      {post.imageUrl && (
        <Image
          style={homeStyles.postCardImage}
          source={{ uri: post.imageUrl }}
          resizeMode="cover"
        />
      )}
      <PostCardFooter postId={post._id} />
    </LinearGradient>
  );
};

export default PostCard;
