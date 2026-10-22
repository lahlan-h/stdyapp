import type { ComponentProps } from "react";
import { Text, Pressable, ActivityIndicator } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, haptics, PROFILE_ACTION_ICON_SIZE } from "@theme";
import type { FollowState, FollowStatus } from "@data";

/** What the pill says and shows in each state, and what tapping it does. */
const FACES: Record<
  FollowStatus,
  { label: string; icon: ComponentProps<typeof Feather>["name"]; a11y: string }
> = {
  none: { label: "Follow", icon: "user-plus", a11y: "Follow" },
  // Waiting on a private account. Tapping takes the request back.
  requested: { label: "Requested", icon: "clock", a11y: "Cancel follow request" },
  following: { label: "Following", icon: "user-check", a11y: "Unfollow" },
};

/**
 * Follow and unfollow on someone else's profile, in ProfileActions' pill - and,
 * for a private account, Requested while it decides.
 *
 * Takes the follow state rather than reading it, so the screen that owns the
 * follower count also owns the write that changes it - see useFollow.
 *
 * Renders no wrapper of its own: the profile stacks it with the Message button
 * inside one `actions` column, and a wrapper here would double its gap.
 */
const FollowButton = ({ status, isBusy, error, toggle }: FollowState) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  // Unknown until the follow summary lands. A pill reading "Follow" before then
  // would invite a tap that might mean the opposite.
  const isKnown = status !== undefined;
  const face = FACES[status ?? "none"];
  // Only Follow is the filled, primary pill: Requested and Following are both
  // states you are already in, so they drop back to the outline.
  const isPrimary = status === "none";
  const tint = isPrimary ? colors.bg : colors.text;

  return (
    <>
      <Pressable
        onPress={() => {
          haptics.tap();
          toggle();
        }}
        disabled={!isKnown || isBusy}
        accessibilityRole="button"
        accessibilityLabel={face.a11y}
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
            <Feather name={face.icon} size={PROFILE_ACTION_ICON_SIZE} color={tint} />
            <Text style={[styles.actionLabel, isPrimary && styles.actionLabelOnPrimary]}>
              {face.label}
            </Text>
          </>
        )}
      </Pressable>
      {error ? <Text style={styles.actionError}>{error}</Text> : null}
    </>
  );
};

export default FollowButton;
