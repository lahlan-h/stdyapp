import { View, Text } from "react-native";
import React from "react";

import { api, Doc, Id } from "@stdyapp/core";
import useTheme from "@hooks/useTheme";
import { createHomeStyles } from "assets/styles/home.styles";
import { useQuery } from "convex/react";

import FontAwesome from "@expo/vector-icons/FontAwesome";

interface PostCardFooterProps {
  postId: Id<"posts">;
}

const PostCardFooter = ({ postId }: PostCardFooterProps) => {
  const { colors } = useTheme();
  const homeStyles = createHomeStyles(colors);
  const likes = useQuery(api.likes.getLikes, { postId });

  return (
    <View style={homeStyles.postCardFooter}>
      <FontAwesome name="heart-o" size={22} color={colors.text} />
      <Text style={homeStyles.soft}>{likes?.length ?? 0}</Text>
    </View>
  );
};

export default PostCardFooter;
