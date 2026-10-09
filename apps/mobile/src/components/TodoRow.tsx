import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRoutinesStyles, ROUTINES_ICON_SIZE } from "@theme";
import type { TodoItem } from "@data";

import DueDateChips, { formatDue, isOverdue } from "@components/DueDateChips";

/**
 * One todo in a routine.
 *
 * The whole row ticks the box, as in the study checklist, so ticking needs no
 * aim. The "more" button opens a small panel under the row for the due date,
 * moving the item up or down, and remove. Buttons rather than drag-to-reorder:
 * there is no drag list in the app's dependencies, and two taps are easier to
 * hit than a long-press-and-drag on a small row.
 *
 * A panel rather than an Alert action sheet, because react-native-web's
 * Alert.alert does nothing - see confirmSignOut.
 */

interface TodoRowProps {
  todo: TodoItem;
  isFirst: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDueChange: (dueDate: string | null) => void;
  onRemove: () => void;
  /** Absent for the first item. */
  onMoveUp?: () => void;
  /** Absent for the last item. */
  onMoveDown?: () => void;
}

const TodoRow = ({
  todo,
  isFirst,
  isOpen,
  onToggle,
  onOpen,
  onDueChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: TodoRowProps) => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  const overdue = isOverdue(todo.dueDate, todo.isComplete);
  const dueColor = overdue ? colors.danger : colors.textMuted;

  return (
    <View style={!isFirst && styles.todoDivider}>
      <Pressable
        style={({ pressed }) => [styles.todoRow, pressed && styles.pressed]}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.isComplete }}
        accessibilityLabel={todo.title}
        accessibilityHint="Marks this task done"
      >
        <View style={[styles.checkbox, todo.isComplete && styles.checkboxChecked]}>
          {todo.isComplete ? (
            <Feather name="check" size={14} color={colors.surface} />
          ) : null}
        </View>

        <View style={styles.todoText}>
          <Text
            style={[styles.todoTitle, todo.isComplete && styles.todoTitleDone]}
            numberOfLines={3}
          >
            {todo.title}
          </Text>
          {todo.dueDate ? (
            <View style={styles.dueRow}>
              <Feather name={overdue ? "alert-circle" : "calendar"} size={12} color={dueColor} />
              {/* "Overdue" in words too, so the state never rests on red alone. */}
              <Text style={[styles.dueText, overdue && styles.dueOverdue]}>
                {overdue ? "Overdue · " : "Due "}
                {formatDue(todo.dueDate)}
              </Text>
            </View>
          ) : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
          onPress={onOpen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isOpen ? `Close options for ${todo.title}` : `Options for ${todo.title}`}
          accessibilityState={{ expanded: isOpen }}
        >
          <Feather
            name={isOpen ? "chevron-up" : "more-horizontal"}
            size={ROUTINES_ICON_SIZE}
            color={colors.textMuted}
          />
        </Pressable>
      </Pressable>

      {isOpen ? (
        <View style={styles.todoPanel}>
          <DueDateChips value={todo.dueDate} onChange={onDueChange} />
          <View style={styles.panelActions}>
            <PanelButton
              icon="arrow-up"
              label="Up"
              a11y={`Move ${todo.title} up`}
              onPress={onMoveUp}
            />
            <PanelButton
              icon="arrow-down"
              label="Down"
              a11y={`Move ${todo.title} down`}
              onPress={onMoveDown}
            />
            <Pressable
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${todo.title}`}
            >
              <Feather name="trash-2" size={13} color={colors.danger} />
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
};

/** A small neutral pill. Disabled, not hidden, at the ends, so nothing jumps. */
const PanelButton = ({
  icon,
  label,
  a11y,
  onPress,
}: {
  icon: "arrow-up" | "arrow-down";
  label: string;
  a11y: string;
  onPress?: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.panelButton,
        !onPress && styles.disabled,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !onPress }}
    >
      <Feather name={icon} size={13} color={colors.text} />
      <Text style={styles.panelButtonText}>{label}</Text>
    </Pressable>
  );
};

export default TodoRow;
