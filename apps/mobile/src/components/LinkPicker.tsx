import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useNewPostStyles, NEW_POST_ROW_ICON_SIZE } from "@theme";
import { useRoutines, useStudySessions } from "@data";

import { describePastSession } from "@components/SessionHistory";

/**
 * The composer's "Link a session" and "Link a routine" choosers.
 *
 * A plain bottom sheet, without RatingSheet's drag: this is a list to pick
 * from, and the backdrop and the close button are the two ways out.
 *
 * Each picker owns its list hook and is RENDERED ONLY WHILE OPEN, so the
 * composer costs no requests for links the user never asks to add. Only the
 * user's own sessions and routines are offered, which is also exactly what
 * the API accepts - anything else is a 403.
 */

export interface LinkChoice {
  id: string;
  label: string;
}

interface Option extends LinkChoice {
  detail?: string;
}

interface SheetProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  options?: Option[];
  isLoading: boolean;
  error?: string;
  empty: string;
  selectedId?: string;
  onSelect: (choice: LinkChoice) => void;
  onClose: () => void;
}

const LinkSheet = ({
  title,
  icon,
  options,
  isLoading,
  error,
  empty,
  selectedId,
  onSelect,
  onClose,
}: SheetProps) => {
  const { colors } = useTheme();
  const styles = useNewPostStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.pickerBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>{title}</Text>
          <Pressable
            style={styles.rowClear}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="x" size={NEW_POST_ROW_ICON_SIZE} color={colors.textMuted} />
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!options ? (
          isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
        ) : options.length === 0 ? (
          <Text style={styles.pickerState}>{empty}</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option.id === selectedId;
              return (
                <Pressable
                  key={option.id}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    (selected || pressed) && styles.pickerOptionSelected,
                  ]}
                  onPress={() => onSelect({ id: option.id, label: option.label })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={[option.label, option.detail].filter(Boolean).join(", ")}
                >
                  <Feather name={icon} size={NEW_POST_ROW_ICON_SIZE} color={colors.textMuted} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {option.label}
                    </Text>
                    {option.detail ? (
                      <Text style={styles.rowValue}>{option.detail}</Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Feather name="check" size={NEW_POST_ROW_ICON_SIZE} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

interface PickerProps {
  selectedId?: string;
  onSelect: (choice: LinkChoice) => void;
  onClose: () => void;
}

export const SessionLinkPicker = (props: PickerProps) => {
  const { sessions, isLoading, error } = useStudySessions();

  return (
    <LinkSheet
      {...props}
      title="Link a session"
      icon="clock"
      isLoading={isLoading}
      error={error}
      empty="No finished sessions yet. Study one, then share it."
      options={sessions?.map((session) => ({
        id: session.id,
        // The label is what the composer row shows once chosen, so it says
        // which session rather than repeating "session".
        label: describePastSession(session),
        detail: [
          session.groupName ?? "Solo",
          session.focusScore !== null ? `focus ${session.focusScore}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }))}
    />
  );
};

export const RoutineLinkPicker = (props: PickerProps) => {
  const { routines, isLoading, loadError } = useRoutines();

  return (
    <LinkSheet
      {...props}
      title="Link a routine"
      icon="repeat"
      isLoading={isLoading}
      error={loadError}
      empty="No routines yet. Make one from the Study tab."
      options={routines?.map((routine) => ({
        id: routine.id,
        label: routine.title,
        detail:
          routine.todoCount === 0
            ? "No tasks yet"
            : `${routine.completedCount} of ${routine.todoCount} done`,
      }))}
    />
  );
};
