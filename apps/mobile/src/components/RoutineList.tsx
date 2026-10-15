import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRoutinesStyles } from "@theme";
import { useRoutines, MAX_ROUTINE_TITLE_LENGTH } from "@data";

import RoutineRow from "@components/RoutineRow";

/**
 * The Study tab's Routines view: make a routine, open one.
 *
 * A component rather than a screen: it renders inside the Study tab's own
 * scroller, under the Sessions | Routines switch. Mounted only while that
 * switch is on Routines, so the list loads when it is first shown and not on
 * every visit to Study.
 *
 * Creating a routine opens it straight away. A routine with no tasks is not
 * much use, and the routine screen is where tasks are added.
 */
const RoutineList = () => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  const { routines, isLoading, loadError, actionError, busy, reload, create } = useRoutines();
  const [title, setTitle] = useState("");

  /**
   * Reload on coming BACK to the Study tab - the done counts change on the
   * routine screen. Skips the first focus, which the hook has already loaded.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload]),
  );

  const canCreate = title.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canCreate) return;
    const routine = await create(title);
    if (routine) {
      setTitle("");
      router.push({ pathname: "/routine/[id]", params: { id: routine.id } });
    }
  };

  const error = actionError ?? loadError;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>New routine</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            placeholder="e.g. Exam week revision"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={MAX_ROUTINE_TITLE_LENGTH}
            accessibilityLabel="New routine name"
          />
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              !canCreate && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={submit}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Create routine"
          >
            {busy ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Feather name="plus" size={18} color={colors.surface} />
            )}
          </Pressable>
        </View>
      </View>

      {error ? (
        <Pressable style={styles.error} onPress={reload} accessibilityRole="button">
          <Feather name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>
            {error}
            {loadError ? "\nTap to try again." : ""}
          </Text>
        </Pressable>
      ) : null}

      {!routines ? (
        isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
      ) : routines.length === 0 ? (
        <Text style={styles.stateText}>
          No routines yet. Make one for anything you study again and again.
        </Text>
      ) : (
        routines.map((routine) => (
          <RoutineRow
            key={routine.id}
            routine={routine}
            onPress={() => router.push({ pathname: "/routine/[id]", params: { id: routine.id } })}
          />
        ))
      )}
    </>
  );
};

export default RoutineList;
