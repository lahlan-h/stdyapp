import { Image, Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, GROUPS_ICON_SIZE } from "@theme";
import type { GroupMember, GroupRole, StudyGroup } from "@data";

import { defaultAvatar } from "@components/defaultAvatar";
import { confirmGroupAction } from "@components/confirmGroup";

interface GroupMemberRowProps {
  member: GroupMember;
  group: StudyGroup;
  isOpen: boolean;
  onToggle: () => void;
  onSetRole: (role: GroupRole) => void;
  onRemove: () => void;
  onTransfer: () => void;
}

/**
 * One member, and - for whoever may manage them - what can be done to them.
 *
 * The rules mirror studyGroup.service.js so a button is never offered that
 * the API would refuse:
 *   - the owner manages everyone but themselves: role, removal, handing over;
 *   - an admin may only remove plain members;
 *   - everyone else manages no one.
 *
 * Neither rule ever reaches the viewer's own row - the owner's row is the
 * owner, and an admin's row is an admin - so no "is this me" check is needed.
 *
 * Every destructive choice is confirmed - see confirmGroup.ts, which also
 * covers the web, where a bare Alert.alert does nothing.
 */
const GroupMemberRow = ({
  member,
  group,
  isOpen,
  onToggle,
  onSetRole,
  onRemove,
  onTransfer,
}: GroupMemberRowProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();

  const isOwnerRow = member.userId === group.ownerId;
  const canChangeRole = group.isOwner && !isOwnerRow;
  const canRemove =
    !isOwnerRow && (group.isOwner || (group.role === "ADMIN" && member.role === "MEMBER"));
  const canTransfer = group.isOwner && !isOwnerRow;
  const manageable = canChangeRole || canRemove || canTransfer;

  const name = member.user.username;
  const meta = isOwnerRow ? "Owner" : member.role === "ADMIN" ? "Admin" : undefined;

  const confirmRemove = () =>
    confirmGroupAction(
      `Remove ${name}?`,
      "They can join again if the group lets them.",
      "Remove",
      onRemove,
    );

  const confirmTransfer = () =>
    confirmGroupAction(
      `Make ${name} the owner?`,
      "They get full control of the group. You stay on as a member and cannot undo this yourself.",
      "Make owner",
      onTransfer,
    );

  return (
    <View>
      <View style={styles.personRow}>
        <Image
          style={styles.avatar}
          source={{ uri: member.user.avatarUrl ?? defaultAvatar(name) }}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.personText}>
          <Text style={styles.personName} numberOfLines={1}>
            {name}
          </Text>
          {meta ? <Text style={styles.personMeta}>{meta}</Text> : null}
        </View>
        {manageable ? (
          <Pressable
            style={styles.moreButton}
            onPress={onToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${name}`}
            accessibilityState={{ expanded: isOpen }}
          >
            <Feather
              name={isOpen ? "chevron-up" : "more-horizontal"}
              size={GROUPS_ICON_SIZE}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      {manageable && isOpen ? (
        <View style={styles.memberPanel}>
          {canChangeRole ? (
            <Pressable
              style={({ pressed }) => [styles.panelButton, pressed && styles.pressed]}
              onPress={() => onSetRole(member.role === "ADMIN" ? "MEMBER" : "ADMIN")}
              accessibilityRole="button"
            >
              <Feather name="shield" size={14} color={colors.text} />
              <Text style={styles.panelButtonText}>
                {member.role === "ADMIN" ? "Remove admin" : "Make admin"}
              </Text>
            </Pressable>
          ) : null}
          {canTransfer ? (
            <Pressable
              style={({ pressed }) => [styles.panelButton, pressed && styles.pressed]}
              onPress={confirmTransfer}
              accessibilityRole="button"
            >
              <Feather name="award" size={14} color={colors.text} />
              <Text style={styles.panelButtonText}>Make owner</Text>
            </Pressable>
          ) : null}
          {canRemove ? (
            <Pressable
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              onPress={confirmRemove}
              accessibilityRole="button"
            >
              <Feather name="user-x" size={14} color={colors.danger} />
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default GroupMemberRow;
