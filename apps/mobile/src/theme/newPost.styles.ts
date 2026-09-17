import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the discard button pinned to the top right. */
const EXIT_SIZE = 40;

/** The glyph inside it. */
const EXIT_ICON_SIZE = 18;

/** Leading icon on a link row, and the box reserved for it. */
const ROW_ICON_SIZE = 20;
const ROW_ICON_BOX = 28;

export const createNewPostStyles = (colors: ColorScheme) => {
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
      gap: 22,
    },

    /**
     * Pinned outside the scroller, so leaving is always one tap away.
     *
     * The screen is long enough to scroll, and a discard control that scrolls
     * off the top strands anyone who changes their mind halfway down.
     */
    exit: {
      position: "absolute",
      right: 16,
      width: EXIT_SIZE,
      height: EXIT_SIZE,
      borderRadius: EXIT_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
      zIndex: 2,
    },

    // The post's text, edited in place as the screen's headline rather than
    // sitting in a labelled box below it. Cleared to the right so a long one
    // never runs under the discard button.
    titleInput: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
      paddingTop: 8,
      paddingBottom: 8,
      paddingRight: EXIT_SIZE + 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    counter: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingTop: 2,
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

    // --- Photo ---
    // Square, matching how it renders in the feed, so what you pick is what
    // everyone else will see.
    photoWell: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.editInput,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      gap: 10,
    },
    photo: {
      width: "100%",
      height: "100%",
    },
    photoPrompt: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.textMuted,
    },
    photoHint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    // Sits on the chosen photo, which is an arbitrary image, so it carries its
    // own surface rather than relying on contrast with whatever is underneath.
    photoChange: {
      position: "absolute",
      right: 12,
      bottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoChangeLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },

    // --- Link rows ---
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      minHeight: 58,
    },
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
    rowValue: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    rowDisabled: {
      opacity: 0.45,
    },
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
    footnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingTop: 2,
    },

    // --- Error ---
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

    // --- Submit ---
    // Pinned, for the same reason as the discard button: the primary action of
    // a screen should not require scrolling to find.
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    submit: {
      height: 54,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    submitDisabled: {
      opacity: 0.45,
    },
    // Always the light palette's surface, never colors.text: this label sits on
    // gradients.primary, the same mid blue in both themes, so flipping it with
    // the theme would put dark text on a dark-enough blue in light mode.
    submitLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
    },
  });
  return styles;
};

export { EXIT_ICON_SIZE, ROW_ICON_SIZE };
