import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * The delete-account dialog's OWN styles - only what the report dialog does
 * not already have.
 *
 * The overlay, the card, the header, the rules, the error box and the footer
 * all come from reportDialog.styles.ts, which is this app's one dialog recipe:
 * a second copy of it would be a second place for the two dialogs to drift
 * apart. What is here is the password field, the destructive button and the
 * Google alternative.
 */

/** The eye on the password field, as on the login screen. */
const DELETE_REVEAL_ICON_SIZE = 18;

/** Google's "G" on its button, as on the login screen. */
const DELETE_GOOGLE_MARK_SIZE = 20;

/** The reveal button's touch target. */
const REVEAL_SIZE = 40;

export const createDeleteAccountDialogStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 12,
    },
    /** What is about to go, in the warning's own words. */
    warning: {
      flexDirection: "row",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    warningText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
    },
    label: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      color: colors.text,
      paddingHorizontal: 4,
    },

    // The login screen's password field, unchanged: one shape for "type your
    // password" across the app.
    inputWrap: {
      justifyContent: "center",
    },
    input: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingRight: REVEAL_SIZE + 12,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      color: colors.text,
    },
    reveal: {
      position: "absolute",
      right: 4,
      width: REVEAL_SIZE,
      height: REVEAL_SIZE,
      borderRadius: REVEAL_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },

    /** "or", between the password and Google. */
    or: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
    },
    // The login screen's Google button, at the dialog's height.
    google: {
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.google.edge,
      backgroundColor: colors.google.fill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    googleLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.google.text,
    },

    /**
     * The quiet way out, beside the loud one. Plain text on the card rather
     * than a second filled button, so Cancel can never be mistaken for the
     * button that deletes.
     */
    cancel: {
      height: 46,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.textMuted,
    },
  });

export { DELETE_REVEAL_ICON_SIZE, DELETE_GOOGLE_MARK_SIZE };
