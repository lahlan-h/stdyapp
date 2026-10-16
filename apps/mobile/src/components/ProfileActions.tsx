import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import type { ComponentProps } from "react";

import { useTheme, useStyles, PROFILE_ACTION_ICON_SIZE } from "@theme";

import { confirmSignOut } from "./confirmSignOut";

interface ActionProps {
  icon: ComponentProps<typeof Feather>["name"];
  label: string;
  /** What a screen reader says, when the label is shortened to fit. */
  spokenLabel?: string;
  onPress: () => void;
  /** Red, for the one action that ends something - signing out. */
  danger?: boolean;
}

const Action = ({ icon, label, spokenLabel, onPress, danger = false }: ActionProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel ?? label}
      style={({ pressed }) => [styles.actionButton, pressed ? { opacity: 0.6 } : undefined]}
    >
      <Feather
        name={icon}
        size={PROFILE_ACTION_ICON_SIZE}
        color={danger ? colors.danger : colors.text}
      />
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
};

/**
 * Your own profile's four actions, two to a row: edit and history, then
 * analytics and sign out.
 *
 * Sign out sits last, bottom right, the corner a thumb reaches least - the one
 * action here that cannot be taken back with a tap. It still confirms first;
 * see confirmSignOut.
 *
 * Analytics lives here rather than on the Study tab: it is about you over
 * weeks, which is what a profile is, while Study is about the session in front
 * of you.
 */
const ProfileActions = () => {
  const styles = useStyles("profile");

  return (
    <View style={styles.actions}>
      <Action icon="edit-2" label="Edit profile" onPress={() => router.push("/edit-profile")} />
      <Action
        icon="clock"
        label="History"
        spokenLabel="Session history"
        onPress={() => router.push("/sessions")}
      />
      <Action icon="bar-chart-2" label="Analytics" onPress={() => router.push("/analytics")} />
      <Action icon="log-out" label="Sign out" onPress={confirmSignOut} danger />
    </View>
  );
};

export default ProfileActions;
