import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRoutinesStyles, ROUTINES_HEADER_ICON_SIZE } from "@theme";
import { useRoutine, MAX_ROUTINE_TITLE_LENGTH, MAX_TODO_TITLE_LENGTH } from "@data";

import DueDateChips from "@components/DueDateChips";
import TodoRow from "@components/TodoRow";
import { confirmDeleteRoutine, confirmResetRoutine } from "@components/confirmRoutine";

/**
 * One routine and its todo list. Pushed from the Study tab's Routines view.
 *
 * Tasks stay in the order the API gives (their position). The app never
 * re-sorts them itself - moving a ticked task to the bottom would slide the
 * next row under the finger mid-tap - so order changes only when the user
 * moves an item.
 */
const RoutineScreen = () => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    routine,
    isLoading,
    loadError,
    actionError,
    clearActionError,
    reload,
    rename,
    remove,
    addTodo,
    toggleTodo,
    editTodo,
    removeTodo,
    moveTodo,
    resetAll,
  } = useRoutine(id);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskDue, setTaskDue] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** Which todo has its options panel open. One at a time. */
  const [openId, setOpenId] = useState<string | null>(null);

  const startRename = () => {
    if (!routine) return;
    setTitleDraft(routine.title);
    setRenaming(true);
  };

  const saveRename = async () => {
    const clean = titleDraft.trim();
    // Nothing changed, or emptied: just close. An empty title is a 400 anyway.
    if (!clean || clean === routine?.title) {
      setRenaming(false);
      return;
    }
    if (await rename(clean)) setRenaming(false);
  };

  const submitTask = async () => {
    if (!taskDraft.trim() || adding) return;
    setAdding(true);
    const ok = await addTodo(taskDraft, taskDue);
    setAdding(false);
    // Kept on failure, so a rejected task does not have to be retyped. The due
    // date is kept on success too: tasks added together tend to share one.
    if (ok) setTaskDraft("");
  };

  const askReset = () => {
    if (!routine) return;
    confirmResetRoutine(routine.title, () => {
      setOpenId(null);
      void resetAll();
    });
  };

  const askDelete = () => {
    if (!routine) return;
    confirmDeleteRoutine(routine.title, async () => {
      if (await remove()) router.back();
    });
  };

  const items = routine?.todoItems ?? [];
  const done = items.filter((t) => t.isComplete).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const error = actionError ?? loadError;

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading && !!routine}
              onRefresh={reload}
              tintColor={colors.textMuted}
            />
          }
        >
          <View style={styles.header}>
            <Pressable
              style={styles.headerButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather name="chevron-left" size={ROUTINES_HEADER_ICON_SIZE} color={colors.text} />
            </Pressable>

            {renaming ? (
              <TextInput
                style={styles.titleInput}
                value={titleDraft}
                onChangeText={setTitleDraft}
                onSubmitEditing={saveRename}
                autoFocus
                returnKeyType="done"
                maxLength={MAX_ROUTINE_TITLE_LENGTH}
                accessibilityLabel="Routine name"
              />
            ) : (
              <Text style={styles.detailTitle} numberOfLines={3}>
                {routine?.title ?? ""}
              </Text>
            )}

            {routine ? (
              <>
                <Pressable
                  style={styles.headerButton}
                  onPress={renaming ? saveRename : startRename}
                  accessibilityRole="button"
                  accessibilityLabel={renaming ? "Save name" : "Rename routine"}
                >
                  <Feather
                    name={renaming ? "check" : "edit-2"}
                    size={ROUTINES_HEADER_ICON_SIZE}
                    color={colors.text}
                  />
                </Pressable>
                {!renaming ? (
                  <Pressable
                    style={[styles.headerButton, styles.headerButtonDanger]}
                    onPress={askDelete}
                    accessibilityRole="button"
                    accessibilityLabel="Delete routine"
                  >
                    <Feather name="trash-2" size={ROUTINES_HEADER_ICON_SIZE} color={colors.danger} />
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>

          {error ? (
            <Pressable
              style={styles.error}
              onPress={loadError ? reload : clearActionError}
              accessibilityRole="button"
            >
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>
                {error}
                {loadError ? "\nTap to try again." : ""}
              </Text>
            </Pressable>
          ) : null}

          {!routine ? (
            isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
          ) : (
            <>
              {items.length > 0 ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Progress</Text>
                    <Text style={styles.cardCount}>{percent}%</Text>
                  </View>
                  <Text style={styles.progressValue}>
                    {done} of {items.length} done
                  </Text>
                  <View
                    style={styles.meterTrack}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={`${done} of ${items.length} tasks done`}
                    accessibilityValue={{ min: 0, max: 100, now: percent }}
                  >
                    <View style={[styles.meterFill, { width: `${percent}%` }]} />
                  </View>
                  {/* Only once something is ticked - there is nothing to undo before. */}
                  {done > 0 ? (
                    <Pressable
                      style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
                      onPress={askReset}
                      accessibilityRole="button"
                      accessibilityLabel="Start again"
                      accessibilityHint="Unticks every task"
                    >
                      <Feather name="rotate-ccw" size={14} color={colors.text} />
                      <Text style={styles.resetText}>Start again</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.card}>
                {/* No count here: the Progress card above already says it. */}
                <Text style={styles.cardTitle}>Tasks</Text>

                {items.length === 0 ? (
                  <Text style={styles.emptyText}>
                    Add the steps you work through each time you study this.
                  </Text>
                ) : null}

                {/* gap 0 between rows: the dividers do the spacing. */}
                <View>
                  {items.map((todo, index) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      isFirst={index === 0}
                      isOpen={openId === todo.id}
                      onToggle={() => toggleTodo(todo)}
                      onOpen={() => setOpenId((prev) => (prev === todo.id ? null : todo.id))}
                      onDueChange={(dueDate) => editTodo(todo.id, { dueDate })}
                      onRemove={() => {
                        setOpenId(null);
                        removeTodo(todo.id);
                      }}
                      onMoveUp={index > 0 ? () => moveTodo(todo.id, "up") : undefined}
                      onMoveDown={
                        index < items.length - 1 ? () => moveTodo(todo.id, "down") : undefined
                      }
                    />
                  ))}
                </View>

                <View style={styles.addRow}>
                  <TextInput
                    style={styles.input}
                    value={taskDraft}
                    onChangeText={setTaskDraft}
                    onSubmitEditing={submitTask}
                    placeholder="Add a task"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                    // Keeps the field up after Return, for adding several in a row.
                    submitBehavior="submit"
                    maxLength={MAX_TODO_TITLE_LENGTH}
                    accessibilityLabel="New task"
                  />
                  <Pressable
                    style={({ pressed }) => [
                      styles.addButton,
                      (!taskDraft.trim() || adding) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={submitTask}
                    disabled={!taskDraft.trim() || adding}
                    accessibilityRole="button"
                    accessibilityLabel="Add task"
                  >
                    {adding ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Feather name="plus" size={18} color={colors.surface} />
                    )}
                  </Pressable>
                </View>
                <DueDateChips value={taskDue} onChange={setTaskDue} />
              </View>

              {routine.sourceRoutineId ? (
                <Text style={styles.footnote}>
                  Copied from another routine. Your progress here is your own.
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default RoutineScreen;
