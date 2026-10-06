import { View, Text, Pressable, ActivityIndicator } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, PROFILE_ACTION_ICON_SIZE } from "@theme";
import type { FollowState } from "@data";

/**
 * The one action on someone else's profile, in ProfileActions' pill.
 *
 * Takes the follow state rather than reading it, so the screen that owns the
 * follower count also owns the write that changes it - see useFollow.
 */
const FollowButton = ({ isFollowing, isBusy, error, toggle }: FollowState) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  // Unknown until the follow summary lands. A pill reading "Follow" before then
  // would invite a tap that might mean the opposite.
  const isKnown = isFollowing !== undefined;
  const label = isFollowing ? "Following" : "Follow";
  const isPrimary = isKnown && !isFollowing;
  const tint = isPrimary ? colors.bg : colors.text;

  return (
    <View style={styles.actions}>
      <Pressable
        onPress={toggle}
        disabled={!isKnown || isBusy}
        accessibilityRole="button"
        accessibilityLabel={isFollowing ? "Unfollow" : "Follow"}
        accessibilityState={{ disabled: !isKnown || isBusy, busy: isBusy }}
        style={({ pressed }) => [
          styles.actionButton,
          isPrimary && styles.actionButtonPrimary,
          (pressed || !isKnown) && { opacity: 0.6 },
        ]}
      >
        {!isKnown ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <>
            <Feather
              name={isFollowing ? "user-check" : "user-plus"}
              size={PROFILE_ACTION_ICON_SIZE}
              color={tint}
            />
            <Text style={[styles.actionLabel, isPrimary && styles.actionLabelOnPrimary]}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
      {error ? <Text style={styles.actionError}>{error}</Text> : null}
    </View>
  );
};

export default FollowButton;
