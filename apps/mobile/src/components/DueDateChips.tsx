import { Pressable, Text, View } from "react-native";

import { useRoutinesStyles } from "@theme";
import { endOfLocalDay } from "@data";

/**
 * Quick picks for a todo's due date, plus the label helpers the todo row uses.
 *
 * Chips, not a calendar: there is no date picker in the app's dependencies,
 * and nearly every study task is due today, tomorrow or within the week.
 */

const OPTIONS: { label: string; offset: number | null }[] = [
  { label: "No date", offset: null },
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "In a week", offset: 7 },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local calendar days from today to the date: 0 today, 1 tomorrow, -1 yesterday. */
export const dayOffset = (iso: string): number => {
  const due = new Date(iso);
  const today = new Date();
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
};

/** "Today", "Tomorrow", "Yesterday", or "Tue 13 Oct". */
export const formatDue = (iso: string): string => {
  const offset = dayOffset(iso);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const date = new Date(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

/** Past its due date and still not done. */
export const isOverdue = (iso: string | null, isComplete: boolean): boolean =>
  !!iso && !isComplete && new Date(iso).getTime() < Date.now();

interface DueDateChipsProps {
  /** The current due date, or null for none. */
  value: string | null;
  onChange: (dueDate: string | null) => void;
}

const DueDateChips = ({ value, onChange }: DueDateChipsProps) => {
  const styles = useRoutinesStyles();
  const current = value === null ? null : dayOffset(value);

  return (
    <View style={styles.chipRow} accessibilityRole="radiogroup">
      {OPTIONS.map(({ label, offset }) => {
        const selected = offset === current;
        return (
          <Pressable
            key={label}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.pressed,
            ]}
            onPress={() => onChange(offset === null ? null : endOfLocalDay(offset))}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Due ${label}`}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default DueDateChips;
