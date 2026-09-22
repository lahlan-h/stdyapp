import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button on the edit screen, and its glyph. */
const BACK_SIZE = 40;
const ACCOUNT_BACK_ICON_SIZE = 18;

/**
 * Sign-in and edit-profile. Both are a column of labelled inputs over a pinned
 * primary button, so they share one sheet. Values follow newPost.styles.ts so
 * the three form screens read as one family.
 */
export const createAccountStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 18,
    },
    // Sign-in has no scroller header to sit under, so it centres instead.
    centred: {
      flexGrow: 1,
      justifyContent: "center",
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
    subtitle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
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

    // --- Buttons --- (see newPost.styles.ts for why centring is on the fill)
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
    secondary: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.textMuted,
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

export { ACCOUNT_BACK_ICON_SIZE };