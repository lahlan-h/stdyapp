import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, haptics, GROUPS_HEADER_ICON_SIZE } from "@theme";
import { useCreateGroup, MAX_GROUP_NAME_LENGTH, type StudyGroup } from "@data";

interface CreateGroupSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The new group - open it, so its code is right there to share. */
  onCreated: (group: StudyGroup) => void;
}

/**
 * Making a study group: a name, whether it is private, and done.
 *
 * A sheet rather than a screen, because it is two fields and a button, and
 * the place it was opened from - the Study tab, before a session - is where
 * the user goes straight back to. Creating opens the new group, whose code is
 * the first thing anyone needs from it.
 *
 * Only offered before a session starts, never during one: see GroupList.
 */
const CreateGroupSheet = ({ visible, onClose, onCreated }: CreateGroupSheetProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();
  const insets = useSafeAreaInsets();
  const { create, isCreating, error } = useCreateGroup();

  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  // Every opening starts clean: a half-typed name from last time would read
  // as a group the user had already started making.
  useEffect(() => {
    if (visible) {
      setName("");
      setIsPrivate(false);
    }
  }, [visible]);

  const canCreate = name.trim().length > 0 && !isCreating;

  const submit = async () => {
    if (!canCreate) return;
    const group = await create({ name, isPrivate });
    if (group) {
      haptics.success();
      onCreated(group);
    } else {
      haptics.failure();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>New study group</Text>
          <Text style={styles.sheetCaption}>
            It gets a six-character code. Anyone you share it with can join.
          </Text>

          <TextInput
            style={[styles.input, styles.sheetInput]}
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder="e.g. COMP3000 study crew"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            autoFocus
            maxLength={MAX_GROUP_NAME_LENGTH}
            accessibilityLabel="Group name"
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Private - only joinable by its code</Text>
            <Switch
              value={isPrivate}
              onValueChange={(next) => {
                haptics.tick();
                setIsPrivate(next);
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Private group"
            />
          </View>

          {error ? <Text style={styles.joinError}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              !canCreate && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={submit}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Create group"
            accessibilityState={{ disabled: !canCreate, busy: isCreating }}
          >
            {isCreating ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Feather name="plus" size={GROUPS_HEADER_ICON_SIZE} color="#ffffff" />
                <Text style={styles.primaryButtonText}>Create group</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default CreateGroupSheet;
