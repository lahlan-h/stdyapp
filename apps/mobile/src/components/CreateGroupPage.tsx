import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, haptics, GROUPS_HEADER_ICON_SIZE } from "@theme";
import { useCreateGroup, MAX_GROUP_NAME_LENGTH, type StudyGroup } from "@data";

interface CreateGroupPageProps {
  visible: boolean;
  onClose: () => void;
  /** The new group - open it, so its code is right there to share. */
  onCreated: (group: StudyGroup) => void;
}

/**
 * Making a study group: a name, whether it is private, and done.
 *
 * A WHOLE PAGE, not a sheet. It was a sheet at the foot of the screen, and the
 * keyboard - which opens straight away, for the name - rose over it, hiding the
 * field being typed into and the button that finishes. Here everything sits at
 * the top, under the close button, so the keyboard only ever covers empty page.
 *
 * Creating opens the new group, whose code is the first thing anyone needs
 * from it. Only offered before a session starts: the Study tab drops its
 * Groups view while one runs.
 */
const CreateGroupPage = ({ visible, onClose, onCreated }: CreateGroupPageProps) => {
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar barStyle={colors.statusBarStyle} />
      <LinearGradient colors={colors.gradients.background} style={styles.createPage}>
        <ScrollView
          contentContainerStyle={[
            styles.createContent,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
          ]}
          // A tap on Create while the keyboard is up creates, rather than only
          // putting the keyboard away and needing a second tap.
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.createHeader}>
            <Pressable
              style={({ pressed }) => [styles.createClose, pressed && styles.pressed]}
              onPress={onClose}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
            <Text style={styles.createTitle} accessibilityRole="header">
              New study group
            </Text>
          </View>

          <Text style={styles.createCaption}>
            It gets a six-character code. Anyone you share it with can join.
          </Text>

          <TextInput
            style={[styles.input, styles.createInput]}
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
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
};

export default CreateGroupPage;
