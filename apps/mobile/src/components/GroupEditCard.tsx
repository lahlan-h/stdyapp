import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";

import { useTheme, useGroupsStyles } from "@theme";
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_GROUP_DESCRIPTION_LENGTH,
  type GroupEdit,
  type StudyGroup,
} from "@data";

interface GroupEditCardProps {
  group: StudyGroup;
  busy: boolean;
  /** Resolves true when saved - the card closes itself through onDone then. */
  onSave: (changes: GroupEdit) => Promise<boolean>;
  onDone: () => void;
}

/**
 * Editing a group, in place on its screen.
 *
 * Owners and admins both get here; only the owner sees the privacy switch,
 * because the API lets only the owner change it. Only the fields that actually
 * changed are sent - an admin's save must not carry an isPrivate it may not
 * set, and an unchanged field is not a change.
 */
const GroupEditCard = ({ group, busy, onSave, onDone }: GroupEditCardProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [isPrivate, setIsPrivate] = useState(group.isPrivate);

  const save = async () => {
    const changes: GroupEdit = {};
    const cleanName = name.trim();
    const cleanDescription = description.trim();

    if (cleanName && cleanName !== group.name) changes.name = cleanName;
    if (cleanDescription !== (group.description ?? "")) {
      // An emptied box clears the description rather than storing "".
      changes.description = cleanDescription || null;
    }
    if (group.isOwner && isPrivate !== group.isPrivate) changes.isPrivate = isPrivate;

    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    if (await onSave(changes)) onDone();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Edit group</Text>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Group name"
        placeholderTextColor={colors.textMuted}
        maxLength={MAX_GROUP_NAME_LENGTH}
        accessibilityLabel="Group name"
      />
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={setDescription}
        placeholder="What the group is for (optional)"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={MAX_GROUP_DESCRIPTION_LENGTH}
        accessibilityLabel="Group description"
      />

      {group.isOwner ? (
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Private - joining needs a code</Text>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Private group"
          />
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, styles.flex, pressed && styles.pressed]}
          onPress={onDone}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            styles.flex,
            (busy || !name.trim()) && styles.disabled,
            pressed && styles.pressed,
          ]}
          onPress={save}
          disabled={busy || !name.trim()}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

export default GroupEditCard;
