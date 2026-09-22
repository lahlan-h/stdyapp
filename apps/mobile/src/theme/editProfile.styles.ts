import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button, and its glyph. */
const BACK_SIZE = 40;
const EDIT_PROFILE_BACK_ICON_SIZE = 18;

/**
 * Edit profile: a column of labelled inputs over a pinned Save button. Values
 * follow newPost.styles.ts so the two form screens read as one family.
 */
export const createEditProfileStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 18,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingTop: 8,
    },
    back: {
      width: BACK_SIZE,
      height: BACK_SIZE,
      borderRadius: BACK_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    screenTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
    },

    // --- Fields ---
    field: { gap: 8 },
    fieldHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    fieldLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    counter: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      color: colors.text,
    },
    inputMultiline: {
      minHeight: 96,
      textAlignVertical: "top",
    },
    inputInvalid: {
      borderColor: colors.danger,
    },
    hint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      paddingHorizontal: 6,
    },
    hintInvalid: {
      color: colors.danger,
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

    // --- Save button --- (see newPost.styles.ts for why centring is on the fill)
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
      overflow: "hidden",
    },
    submitFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    submitDisabled: { opacity: 0.45 },
    submitLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
    },

    stateText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
    },
  });
  return styles;
};

export { EDIT_PROFILE_BACK_ICON_SIZE };