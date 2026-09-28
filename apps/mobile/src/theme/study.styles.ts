import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * Diameter of the focus dial.
 *
 * Fixed rather than a percentage of the screen: it holds a number that must
 * stay legible on an SE, and the layout around it is a column that can absorb
 * the difference on larger phones.
 */
export const DIAL_SIZE = 216;

/** Thickness of the dial's ring, and of the track behind it. */
export const DIAL_RING = 14;

/** Size of the icon on the primary action button. */
export const STUDY_ICON_SIZE = 20;

/**
 * Breathing room below the last control, ON TOP of the tab bar clearance -
 * the same split settings.styles.ts makes, for the same reason: this is taste,
 * the clearance is a hard requirement.
 */
export const STUDY_FOOTER_ROOM = 32;

export const createStudyStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    /**
      * Holds the gradient backdrop. Same container/safeArea split every other
      * screen uses: without a painted background the screen shows whatever is
      * behind it, which in dark mode is white text on a light page.
      */
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      // No paddingBottom: the last control has to clear the floating tab bar,
      // and that distance is a runtime safe-area value. The screen supplies it
      // as useTabBarClearance() plus STUDY_FOOTER_ROOM.
      gap: 20,
    },

    screenTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    screenSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 2,
    },

    // ---- the dial -----------------------------------------------------
    dialWrap: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
    },
    dial: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      borderRadius: DIAL_SIZE / 2,
      borderWidth: DIAL_RING,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      // The caption is the widest thing in here and the ring is a circle, so
      // without this it runs under the stroke at both ends.
      paddingHorizontal: 22,
    },
    /**
     * Laid over the track to colour it by band. A full ring rather than an arc:
     * a real progress arc needs react-native-svg, which this app does not
     * depend on, and a borderColor swap says "how focused" without pretending
     * to be a gauge it cannot draw accurately.
     */
    dialActive: {
      borderColor: colors.primary,
    },
    dialGood: { borderColor: colors.success },
    dialMid: { borderColor: colors.warning },
    dialPoor: { borderColor: colors.danger },

    dialValue: {
      fontSize: 56,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -2,
      fontVariant: ["tabular-nums"],
    },
    dialLabel: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginTop: 6,
    },
    dialNote: {
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 4,
      textAlign: "center",
    },

    timer: {
      fontSize: 34,
      fontWeight: "600",
      color: colors.text,
      fontVariant: ["tabular-nums"],
      textAlign: "center",
      letterSpacing: -0.5,
    },
    timerLabel: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: 2,
    },

    // ---- planned duration ---------------------------------------------
    section: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
    },
    chip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      backgroundColor: colors.bg,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    /** On the filled chip, which is `primary` in both themes. */
    chipTextSelected: {
      color: colors.surface,
    },
    chipDisabled: {
      opacity: 0.4,
    },

    // ---- stats ---------------------------------------------------------
    statRow: {
      flexDirection: "row",
      gap: 8,
    },
    stat: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 6,
      alignItems: "center",
    },
    statValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    statLabel: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginTop: 3,
      textAlign: "center",
    },
    /** Time away is the one stat that is bad news when it is not zero. */
    statWarn: {
      color: colors.warning,
    },

    // ---- rating ---------------------------------------------------------
    ratingRow: {
      flexDirection: "row",
      gap: 8,
    },
    ratingButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      backgroundColor: colors.bg,
    },
    ratingButtonSelected: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    ratingText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    ratingTextSelected: {
      color: colors.surface,
    },
    helpText: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },

    // ---- primary action --------------------------------------------------
    action: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    actionStop: {
      backgroundColor: colors.danger,
    },
    actionDisabled: {
      opacity: 0.5,
    },
    actionText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.surface,
    },

    // ---- error -----------------------------------------------------------
    errorBox: {
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
      borderRadius: 12,
      padding: 12,
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
    },
  });

  return styles;
};
