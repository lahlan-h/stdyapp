import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRoutinesStyles, ROUTINES_ICON_SIZE } from "@theme";
import type { FeedRoutine } from "@data";

interface PostRoutineLinkProps {
  routine: FeedRoutine;
  /** Whether the viewer wrote the post - and so owns the routine. */
  isMine: boolean;
  /** Spacing from the surrounding card, which differs between feed and detail. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The routine a post links to, as a chip that opens it.
 *
 * The author goes to the routine itself, where they can tick it off. Everyone
 * else goes to its preview, where they can save a copy - the API refuses to
 * link anyone's routine but the author's, so isMine is the whole question.
 */
const PostRoutineLink = ({ routine, isMine, style }: PostRoutineLinkProps) => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();

  const open = () =>
    router.push(isMine ? `/routine/${routine.id}` : `/routine-preview/${routine.id}`);

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.linkChip, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={`Routine: ${routine.title}. ${isMine ? "Open" : "Preview and save"}`}
    >
      <Feather name="repeat" size={ROUTINES_ICON_SIZE} color={colors.primary} />
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>Routine</Text>
        <Text style={styles.linkTitle} numberOfLines={1}>
          {routine.title}
        </Text>
      </View>
      <Feather name="chevron-right" size={ROUTINES_ICON_SIZE} color={colors.textMuted} />
    </Pressable>
  );
};

export default PostRoutineLink;
