import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRoutinesStyles, ROUTINES_ICON_SIZE } from "@theme";
import type { RoutineSummary } from "@data";

/**
 * One routine on the list: title, how far through it you are, and a "Copied"
 * badge when it was cloned from someone else's.
 */

interface RoutineRowProps {
  routine: RoutineSummary;
  onPress: () => void;
}

const RoutineRow = ({ routine, onPress }: RoutineRowProps) => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  const { todoCount, completedCount } = routine;
  const allDone = todoCount > 0 && completedCount === todoCount;
  const count =
    todoCount === 0
      ? "No tasks yet"
      : allDone
        ? `All ${todoCount} done`
        : `${completedCount} of ${todoCount} done`;
  const percent = todoCount ? Math.round((completedCount / todoCount) * 100) : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.routineRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${routine.title}, ${count}`}
    >
      <View style={styles.routineIcon}>
        <Feather name="repeat" size={ROUTINES_ICON_SIZE} color={colors.primary} />
      </View>
      <View style={styles.routineText}>
        <Text style={styles.routineTitle} numberOfLines={2}>
          {routine.title}
        </Text>
        <View style={styles.routineMeta}>
          {allDone ? (
            <Feather name="check-circle" size={13} color={colors.success} />
          ) : null}
          <Text style={[styles.routineMetaText, allDone && styles.routineMetaDone]}>
            {count}
          </Text>
          {routine.sourceRoutineId ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Copied</Text>
            </View>
          ) : null}
        </View>
        {/* Decorative: the words above already say it. */}
        {todoCount > 0 ? (
          <View style={styles.routineMeter} importantForAccessibility="no-hide-descendants">
            <View style={[styles.meterFill, { width: `${percent}%` }]} />
          </View>
        ) : null}
      </View>
      <Feather name="chevron-right" size={ROUTINES_ICON_SIZE} color={colors.textMuted} />
    </Pressable>
  );
};

export default RoutineRow;
