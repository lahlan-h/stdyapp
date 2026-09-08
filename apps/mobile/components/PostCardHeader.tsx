import { View, Text, Image } from "react-native";
import React from "react";
import useTheme from "@hooks/useTheme";
import { createHomeStyles } from "assets/styles/home.styles";

import { formatRelativeTime } from "@stdyapp/shared";

interface PostCardHeaderProps {
  displayName: string;
  username: string;
  avatarUrl?: string;
  createdAt: number;
}

const DEFAULT_AVATAR = (seed: string) => {
  return `https://api.dicebear.com/9.x/initials/png?seed=${seed}`;
};

const PostCardHeader = ({ displayName, avatarUrl, createdAt }: PostCardHeaderProps) => {
  const { colors } = useTheme();
  const homeStyles = createHomeStyles(colors);
  const time = formatRelativeTime(createdAt);

  return (
    <View style={homeStyles.postCardHeaderContainer}>
      <Image
        source={{ uri: avatarUrl ? avatarUrl : DEFAULT_AVATAR(displayName) }}
        style={homeStyles.postCardAvatar}
      />
      <View>
        <Text style={homeStyles.username}>{displayName}</Text>
        <Text style={homeStyles.timestamp}>{time}</Text>
      </View>
    </View>
  );
};

export default PostCardHeader;
