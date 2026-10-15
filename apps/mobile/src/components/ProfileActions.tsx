import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";

import { useTheme, useStyles, PROFILE_ACTION_ICON_SIZE } from "@theme";

/**
 * Edit profile, under the card - the one action your own profile keeps.
 *
 * Sign out and Session history used to sit here too. Both live in Settings
 * now, behind the gear, so the profile stays close to the design: the card,
 * then your sessions.
 */
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
    </View>
  );
};

export default ProfileActions;
