import { View, Text } from "react-native";
import React from "react";
import { createHomeStyles } from "assets/styles/home.styles";
import useTheme from "@hooks/useTheme";
import { LinearGradient } from "expo-linear-gradient";

import { api, Doc, Id } from "@stdyapp/core";
import PostCardHeader from "./PostCardHeader";
import { useQuery } from "convex/react";

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
    </LinearGradient>
  );
};

export default PostCard;
