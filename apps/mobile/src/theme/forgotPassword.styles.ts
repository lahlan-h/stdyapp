import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * The forgot-password screen's own styles - ONLY what the login screen does not
 * already have, as with register.styles.ts. The banner, heading, email field,
 * error box, submit and the link row all come from login.styles.ts.
 */

/** A code slot's height: a little taller than an input, so the slots read as boxes. */
const SLOT_HEIGHT = 56;

export const createForgotPasswordStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // --- Heading ---
    // The code step's subline with "Change email" after it, wrapping as one
    // sentence on a narrow screen.
    subRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: 6,
    },
    // The email inside the subline, at full text colour so it is checkable at
    // a glance.
    email: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.text,
    },

    // --- Code slots ---
    /**
     * Six boxes over one hidden input. The boxes only DISPLAY the code; the
     * input underneath takes every tap and keystroke, which is what keeps
     * typing starting at the first empty box whichever box was tapped.
     */
    slots: {
      flexDirection: "row",
      gap: 8,
    },
    // The login input's fill, hairline and radius, so a slot is plainly a
    // field in the same family.
    slot: {
      flex: 1,
      height: SLOT_HEIGHT,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      alignItems: "center",
      justifyContent: "center",
    },
    // Where the next character lands.
    slotActive: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    // Every slot after a rejected code. The error box below says why.
    slotInvalid: {
      borderColor: colors.danger,
    },
    slotChar: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 22,
      color: colors.text,
    },
    /**
     * The real input, stretched over the row and invisible. Not display:none
     * or zero-sized: it has to stay focusable and catch taps on every slot.
     */
    hiddenInput: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      opacity: 0,
      color: "transparent",
    },

    // --- Resend ---
    resendRow: {
      alignItems: "center",
    },
  });
  return styles;
};
