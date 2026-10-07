import { Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";

import { useTheme, useStyles, PROFILE_ACTION_ICON_SIZE } from "@theme";
import { requestChat, type UserSummary } from "@data";

interface MessageButtonProps {
  /** Who the chat will be with. */
  user: UserSummary;
}

/**
 * "Message" on someone else's profile - where every conversation starts.
 *
 * Chats live on the Home screen's messages page, not on a screen of their own,
 * so this leaves a request for Home (see chatRequest.ts) and pops back to it;
 * Home takes the request as it regains focus and drops the page straight into
 * the chat. dismissTo rather than back, so the way to Home is the same however
 * this profile was reached.
 *
 * The plain outline pill: Follow is the profile's primary action, and two
 * filled pills stacked would compete for the same glance.
 */
const MessageButton = ({ user }: MessageButtonProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  const open = () => {
    requestChat(user);
    router.dismissTo("/");
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Message ${user.displayName}`}
      style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]}
    >
      <Feather name="message-circle" size={PROFILE_ACTION_ICON_SIZE} color={colors.text} />
      <Text style={styles.actionLabel}>Message</Text>
    </Pressable>
  );
};

export default MessageButton;
