import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";

import { useTheme, useStyles, PROFILE_ACTION_ICON_SIZE } from "@theme";

import { confirmSignOut } from "./confirmSignOut";

/** Edit and sign out, side by side under the bio. */
const ProfileActions = () => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <View style={styles.actions}>
      <Pressable
        onPress={() => router.push("/edit-profile")}
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        style={({ pressed }) => [
          styles.actionButton,
          pressed ? { opacity: 0.6 } : undefined,
        ]}
      >
        <Feather name="edit-2" size={PROFILE_ACTION_ICON_SIZE} color={colors.text} />
        <Text style={styles.actionLabel}>Edit profile</Text>
      </Pressable>

      {/* Confirms before acting - see confirmSignOut. */}
      <Pressable
        onPress={confirmSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [
          styles.actionButton,
          pressed ? { opacity: 0.6 } : undefined,
        ]}
      >
        <Feather
          name="log-out"
          size={PROFILE_ACTION_ICON_SIZE}
          color={colors.danger}
        />
        <Text style={[styles.actionLabel, styles.actionLabelDanger]}>
          Sign out
        </Text>
      </Pressable>
    </View>
  );
};

export default ProfileActions;
