import { View, Text, Image } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles } from "@theme";
import { formatRelativeTime } from "@stdyapp/shared";
import type { PostAudience } from "@data";

import { defaultAvatar } from "./defaultAvatar";

interface PostCardHeaderProps {
  displayName: string;
  avatarUrl?: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Where the post went - present only on the viewer's own posts. */
  sharedTo?: PostAudience;
}

/** "Followers · Night Owls", "Night Owls only", or "Followers". */
const audienceLabel = ({ followers, groups }: PostAudience): string => {
  const names = groups.map((group) => group.name);
  if (!followers) return names.length === 1 ? `${names[0]} only` : names.join(" · ");
  return ["Followers", ...names].join(" · ");
};

/**
 * Who posted it, and when - and, on your own posts, who you shared it with:
 * the one place you can check a group-only post did not go to your followers.
 */
const PostCardHeader = ({ displayName, avatarUrl, createdAt, sharedTo }: PostCardHeaderProps) => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");

  return (
    <View style={homeStyles.postCardHeaderContainer}>
      <Image
        source={{ uri: avatarUrl ?? defaultAvatar(displayName) }}
        style={homeStyles.postCardAvatar}
      />
      <View style={homeStyles.postCardHeaderText}>
        <Text style={homeStyles.bold}>{displayName}</Text>
        <Text style={homeStyles.soft}>{formatRelativeTime(createdAt)}</Text>
        {sharedTo ? (
          <View
            style={homeStyles.postCardAudience}
            accessible
            accessibilityLabel={`Shared to ${audienceLabel(sharedTo)}`}
          >
            <Feather
              name={sharedTo.followers ? "users" : "lock"}
              size={12}
              color={colors.textMuted}
              style={homeStyles.postCardAudienceIcon}
            />
            {/* Wraps, never truncates: this line is where you check exactly
                who a post went to, so every group has to be readable. */}
            <Text style={[homeStyles.soft, homeStyles.postCardAudienceText]}>
              {audienceLabel(sharedTo)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default PostCardHeader;
