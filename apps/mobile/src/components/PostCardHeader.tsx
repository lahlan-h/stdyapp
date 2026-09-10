import { View, Text, Image } from "react-native";

import { useHomeStyles } from "@theme";
import { formatRelativeTime } from "@stdyapp/shared";

interface PostCardHeaderProps {
  displayName: string;
  avatarUrl?: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

const defaultAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}`;

const PostCardHeader = ({ displayName, avatarUrl, createdAt }: PostCardHeaderProps) => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.postCardHeaderContainer}>
      <Image
        source={{ uri: avatarUrl ?? defaultAvatar(displayName) }}
        style={homeStyles.postCardAvatar}
      />
      <View>
        <Text style={homeStyles.bold}>{displayName}</Text>
        <Text style={homeStyles.soft}>{formatRelativeTime(createdAt)}</Text>
      </View>
    </View>
  );
};

export default PostCardHeader;
