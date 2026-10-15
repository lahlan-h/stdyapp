import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button, and its glyph - the same as routines'. */
const HEADER_BUTTON_SIZE = 40;
const SESSION_HISTORY_HEADER_ICON_SIZE = 18;

/** Icons inside a session card's stat line. */
const SESSION_HISTORY_ICON_SIZE = 14;

/** The rating stars on a card. */
const SESSION_HISTORY_STAR_SIZE = 13;

/**
 * Session history and its detail view.
 *
 * The list is analytics' visual language - a scrolling column of surface cards
 * under a large title - so it reads as the same part of the app. The detail
 * view borrows the study recap's metric cards and trace from study.styles.ts
 * directly, so a past session looks exactly as it did when it ended; only the
 * header and the list live here.
 */
export const createSessionHistoryStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 12,
    },

    // Everything above the first day: header, error, first-load spinner.
    listHeader: { gap: 12 },

    // --- Header --- (routine/[id]'s back button beside analytics' title)
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 8,
      paddingBottom: 4,
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
    screenTitle: {
      flex: 1,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 28,
      color: colors.text,
    },

    // --- Day groups ---
    dayTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
      paddingTop: 8,
    },

    // --- Session card ---
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 10,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    cardTime: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.text,
    },
    cardDuration: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      color: colors.textMuted,
    },
    // The estimate badge: band colour carries the dot and the text, so the
    // number never depends on colour alone - the label says it too.
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    badgeDot: { width: 7, height: 7, borderRadius: 3.5 },
    badgeText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      fontVariant: ["tabular-nums"],
    },
    statRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 14,
      rowGap: 6,
    },
    stat: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    statText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    stars: {
      flexDirection: "row",
      gap: 2,
    },
    // "Group", "In progress", "Abandoned".
    chip: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      color: colors.textMuted,
    },
    chipDanger: {
      backgroundColor: colors.dangerTint,
      borderColor: colors.dangerEdge,
    },
    chipDangerText: {
      color: colors.danger,
    },

    // --- Detail ---
    detailMeta: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      color: colors.textMuted,
    },
    footnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },

    // --- States --- (analytics' notice and error, verbatim)
    stateText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },
    empty: {
      alignItems: "center",
      gap: 10,
      padding: 24,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    emptyText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: "center",
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

export {
  SESSION_HISTORY_HEADER_ICON_SIZE,
  SESSION_HISTORY_ICON_SIZE,
  SESSION_HISTORY_STAR_SIZE,
};
