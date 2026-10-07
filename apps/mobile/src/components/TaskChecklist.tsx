import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, TASK_ICON_SIZE } from "@theme";
import type { SessionTask } from "@data";

/**
 * What the user means to get done this session - and the only focus signal
 * they define themselves.
 *
 * Ticking items raises the score, so the control has to be cheap to use: one
 * tap per item, a full-width hit area rather than a small box, and no
 * confirmation on anything. Anything that makes ticking feel like admin would
 * cost us the signal.
 *
 * Works in two modes. Before a session exists the items are drafts held on the
 * client and addressed by index; once it starts they are rows with ids. The
 * screen passes whichever it has, so this component never knows the difference.
 */

interface TaskChecklistProps {
  /** Rows, once the session is running. */
  tasks?: SessionTask[];
  /** Plain titles, while still planning. */
  drafts?: string[];
  onAdd: (title: string) => void;
  onToggle?: (task: SessionTask) => void;
  onRemoveDraft?: (index: number) => void;
  onRemoveTask?: (taskId: string) => void;
  /** Hides the input once the list can no longer be changed. */
  editable?: boolean;
}

const TaskChecklist = ({
  tasks,
  drafts,
  onAdd,
  onToggle,
  onRemoveDraft,
  onRemoveTask,
  editable = true,
}: TaskChecklistProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const [draft, setDraft] = useState("");

  const planning = drafts !== undefined;
  const rows = planning ? drafts : (tasks ?? []);
  const done = planning ? 0 : (tasks ?? []).filter((t) => t.isComplete).length;

  const submit = () => {
    const clean = draft.trim();
    if (!clean) return;
    onAdd(clean);
    setDraft("");
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Checklist</Text>
        {rows.length > 0 ? (
          <Text style={styles.cardCount}>
            {planning ? `${rows.length}` : `${done}/${rows.length}`}
          </Text>
        ) : null}
      </View>

      {rows.length === 0 ? (
        // An empty list has to say what it is for; "Checklist" alone does not
        // explain that ticking items moves the score.
        <Text style={styles.emptyText}>
          Add what you want to get done. Ticking things off lifts your score.
        </Text>
      ) : null}

      {rows.map((row, index) => {
        const task = planning ? null : (row as SessionTask);
        const title = planning ? (row as string) : (row as SessionTask).title;
        const checked = task?.isComplete ?? false;

        return (
          <Pressable
            key={task?.id ?? `draft-${index}`}
            // The whole row is the target, not the little box - 44pt minimum,
            // and nothing to aim at.
            style={({ pressed }) => [styles.taskRow, pressed && styles.rowPressed]}
            onPress={() => task && onToggle?.(task)}
            disabled={planning}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: planning }}
            accessibilityLabel={title}
            accessibilityHint={planning ? undefined : "Marks this task done"}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? (
                <Feather name="check" size={14} color={colors.surface} />
              ) : null}
            </View>

            <Text
              style={[styles.taskTitle, checked && styles.taskTitleDone]}
              numberOfLines={2}
            >
              {title}
            </Text>

            {editable ? (
              <Pressable
                style={({ pressed }) => [styles.taskRemove, pressed && styles.rowPressed]}
                onPress={() =>
                  planning ? onRemoveDraft?.(index) : onRemoveTask?.(task!.id)
                }
                // The row is a checkbox; this sits inside it, so it needs its
                // own padded target rather than relying on the icon's bounds.
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${title}`}
              >
                <Feather name="x" size={TASK_ICON_SIZE} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}

      {editable ? (
        <View style={styles.taskAddRow}>
          <TextInput
            style={styles.taskInput}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            placeholder="Add a task"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={120}
            accessibilityLabel="New task"
          />
          <Pressable
            style={({ pressed }) => [
              styles.taskAddButton,
              !draft.trim() && styles.actionDisabled,
              pressed && styles.rowPressed,
            ]}
            onPress={submit}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add task"
          >
            <Feather name="plus" size={18} color={colors.surface} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

export default TaskChecklist;
