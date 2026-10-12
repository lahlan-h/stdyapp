import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, GROUPS_ICON_SIZE } from "@theme";
import type { StudyGroup } from "@data";

/**
 * One group on a list: name, size, and where the viewer stands in it. The
 * routine row's shape, so the Study tab's lists read as one family.
 */

interface GroupRowProps {
  group: StudyGroup;
  onPress: () => void;
}

const GroupRow = ({ group, onPress }: GroupRowProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();
  const members = `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`;
  const standing = group.isOwner ? "Owner" : group.isMember ? "Joined" : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.routineRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[group.name, members, group.isPrivate ? "private" : null, standing]
        .filter(Boolean)
        .join(", ")}
    >
      <View style={styles.routineIcon}>
        <Feather name="users" size={GROUPS_ICON_SIZE} color={colors.primary} />
      </View>
      <View style={styles.routineText}>
        <Text style={styles.routineTitle} numberOfLines={2}>
          {group.name}
        </Text>
        <View style={styles.routineMeta}>
          <Text style={styles.routineMetaText}>{members}</Text>
          {group.isPrivate ? (
            <Feather name="lock" size={12} color={colors.textMuted} />
          ) : null}
          {standing ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{standing}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Feather name="chevron-right" size={GROUPS_ICON_SIZE} color={colors.textMuted} />
    </Pressable>
  );
};

export default GroupRow;
