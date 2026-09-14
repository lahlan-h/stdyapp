import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Size of the leading icon on a settings row, and of the box reserved for it. */
const ROW_ICON_SIZE = 20;

/**
 * Width of the box the leading icon sits in.
 *
 * Fixed rather than sized to the glyph so every label in a section starts on the
 * same x, regardless of how wide the icon it happens to sit next to is.
 */
const ROW_ICON_BOX = 28;

export const createSettingsStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 40,
      gap: 22,
    },
    screenTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
      paddingTop: 8,
      paddingBottom: 2,
    },

    // --- Section ---
    section: {
      gap: 8,
    },
    sectionTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    sectionCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    // Sits under a section card to caveat what the rows in it actually do.
    sectionFootnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingTop: 2,
    },

    // --- Row ---
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      minHeight: 58,
    },
    // Applied to every row after the first, so a section reads as one grouped
    // card instead of a stack of separate ones.
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowIconBox: {
      width: ROW_ICON_BOX,
      alignItems: "flex-start",
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    rowDescription: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    rowLabelDanger: {
      color: colors.danger,
    },
    // Dims the whole row rather than the label alone, so a placeholder reads as
    // inert at a glance instead of looking like a row that failed to load.
    rowDisabled: {
      opacity: 0.45,
    },

    // --- "Soon" badge on placeholder rows ---
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.border,
    },
    badgeText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      letterSpacing: 0.4,
      color: colors.textMuted,
    },

    // --- Theme segmented control ---
    segmentGroup: {
      flexDirection: "row",
      gap: 6,
      padding: 4,
      margin: 10,
      borderRadius: 14,
      backgroundColor: colors.backgrounds.editInput,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 9,
      borderRadius: 10,
      gap: 4,
    },
    segmentSelected: {
      backgroundColor: colors.primary,
    },
    segmentLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    // Always the light palette's surface, never colors.text: this label sits on
    // colors.primary, which is a mid blue in BOTH themes, so flipping it with
    // the theme would put dark text on a dark-enough blue in light mode.
    segmentLabelSelected: {
      color: "#ffffff",
    },

    // --- Footer ---
    footer: {
      alignItems: "center",
      gap: 2,
      paddingTop: 4,
    },
    footerText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
  });
  return styles;
};

/** Re-exported so components can size their icons to match the stylesheet. */
export { ROW_ICON_SIZE };
