import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the header buttons, and their glyph - the same as analytics'. */
const HEADER_BUTTON_SIZE = 40;
const ROUTINES_HEADER_ICON_SIZE = 18;

/** Icons inside rows and chips. */
const ROUTINES_ICON_SIZE = 16;

/** 44pt minimum hit target, as in study.styles.ts. */
const TOUCH_MIN = 44;

/**
 * Routines list and routine detail. Header, card and segment values follow
 * analytics.styles.ts; the checkbox and task row follow the study checklist,
 * so a todo here and a task in a session look like the same control.
 */
export const createRoutinesStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 16,
    },

    // --- Header ---
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 8,
    },
    headerButton: {
      width: HEADER_BUTTON_SIZE,
      height: HEADER_BUTTON_SIZE,
      borderRadius: HEADER_BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerButtonDanger: {
      backgroundColor: colors.dangerTint,
      borderColor: colors.dangerEdge,
    },
    // The detail title is user text and can be long, so it is smaller and wraps.
    detailTitle: {
      flex: 1,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 24,
      lineHeight: 30,
      color: colors.text,
    },
    titleInput: {
      flex: 1,
      minHeight: TOUCH_MIN,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.backgrounds.input,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 18,
      color: colors.text,
    },

    // --- Cards ---
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    cardTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    cardCount: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 13,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },

    // --- Routine list rows ---
    routineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    routineIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    routineText: { flex: 1, gap: 2 },
    routineTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    routineMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    routineMetaText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    routineMetaDone: { color: colors.success },
    // A thinner meterTrack, so a list of them reads as texture, not as charts.
    routineMeter: {
      height: 4,
      marginTop: 6,
      borderRadius: 2,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      color: colors.textMuted,
    },

    // --- Add rows (new routine, new task) ---
    addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    input: {
      flex: 1,
      minHeight: TOUCH_MIN,
      paddingHorizontal: 14,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      fontFamily: "PlusJakartaSans_400Regular",
      color: colors.text,
      fontSize: 15,
    },
    addButton: {
      width: TOUCH_MIN,
      height: TOUCH_MIN,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.6 },

    // --- Due date chips ---
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      minHeight: 32,
      paddingHorizontal: 12,
      justifyContent: "center",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.textMuted,
    },
    // White in both themes: it sits on colors.primary, a mid blue either way.
    chipTextSelected: { color: "#ffffff" },

    // --- Progress ---
    progressValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 28,
      color: colors.text,
    },
    meterTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    meterFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: colors.success,
    },

    // --- Todo rows --- (the study checklist's shape)
    todoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 6,
    },
    todoDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    checkboxChecked: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    todoText: { flex: 1, gap: 2 },
    todoTitle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
    },
    // Struck through AND dimmed, so "done" never rests on colour alone.
    todoTitleDone: {
      color: colors.textMuted,
      textDecorationLine: "line-through",
    },
    dueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dueText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    dueOverdue: { color: colors.danger },
    moreButton: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    // The panel a todo opens into: due date chips and remove.
    todoPanel: {
      gap: 10,
      paddingLeft: 36,
      paddingBottom: 8,
    },
    panelActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    panelButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 32,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    panelButtonText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.text,
    },
    // "Start again" in the progress card: a real button, quieter than primary.
    resetButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    resetText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },
    removeButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      minHeight: 32,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    removeText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.danger,
    },

    // --- States ---
    emptyText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    stateText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },
    footnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },
    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    errorText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.danger,
    },
  });
  return styles;
};

export { ROUTINES_HEADER_ICON_SIZE, ROUTINES_ICON_SIZE };
