import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * Diameter of the close button in the dialog's top-right corner.
 *
 * The same 40 the discard button on the compose screen and the exit on the post
 * detail screen use, because it IS that button: a second close shape would be
 * the only one in the app. See `close` below.
 */
const CLOSE_SIZE = 40;

/** The cross inside it. */
const REPORT_CLOSE_ICON_SIZE = 18;

/** The tick inside a selected reason's box. */
const REPORT_CHECK_ICON_SIZE = 14;

/** The glyph in the 56px badge on the confirmation and reported screens. */
const REPORT_STATE_ICON_SIZE = 26;

/**
 * The flag in that same badge.
 *
 * Two points smaller than the tick it replaces, not by accident: FontAwesome's
 * solid flag carries far more ink than Feather's stroked check, and at a
 * matching size it reads as the louder of the two.
 */
const REPORT_STATE_FLAG_SIZE = 24;

/** The checkbox on each reason row. */
const BOX_SIZE = 22;

/** The badge on the confirmation and reported screens. */
const STATE_CIRCLE = 56;

/**
 * How wide the dialog is allowed to get.
 *
 * A phone-width dialog on a tablet would be a sentence stretched across the
 * room. 342 is the width it has at the gutter below on a 390pt phone, so the
 * common case is unchanged and only the large screen is constrained.
 */
const DIALOG_MAX_WIDTH = 342;

/** The space between the dialog and the screen edge. */
const DIALOG_GUTTER = 24;

export const createReportDialogStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // --- The overlay ------------------------------------------------------
    /**
     * Centres the dialog, and holds the gutter.
     *
     * paddingHorizontal rather than a margin on the dialog itself: a maxWidth
     * with no gutter would sit flush to both edges on a narrow phone, and the
     * padding is what guarantees the gap survives whichever of the two wins.
     */
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: DIALOG_GUTTER,
    },
    scrim: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.scrim,
    },

    // --- The dialog -------------------------------------------------------
    /**
     * The card recipe, at the card radius: r26, a hairline of border, and
     * overflow hidden so the gradient inside takes the corners.
     *
     * alignSelf is what makes maxWidth mean anything. A flex child stretches to
     * its parent's cross axis by default, so `width: "100%"` plus a maxWidth
     * would pin the box to the left edge on a wide screen rather than centring
     * it - the one CSS habit that does not survive the move to React Native.
     *
     * NO SHADOW AND NO ELEVATION. colors.shadow exists and is used by nothing;
     * separation in this app is a border plus the scrim's contrast, and a modal
     * is not the place to break that.
     */
    dialog: {
      width: "100%",
      maxWidth: DIALOG_MAX_WIDTH,
      alignSelf: "center",
      // The reason list is the one part that can outgrow a small screen, once
      // Other opens the detail box. It scrolls inside this bound rather than
      // pushing the submit button off the bottom.
      maxHeight: "85%",
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    /**
     * The gradient, sized by its content.
     *
     * Deliberately has no radius of its own - the parent clips it - which is the
     * same split `card` and `submit`/`submitFill` already use, and the reason
     * both do: a radius set on a LinearGradient clips inconsistently on Android.
     */
    fill: {
      flexShrink: 1,
    },

    /**
     * Lifted verbatim from the post detail screen's exit, minus its `top`.
     *
     * Rendered ONLY while a reason is being chosen. Once the report is filed,
     * the dialog's own button is the way out, and a second dismiss in the corner
     * would compete with it.
     */
    close: {
      position: "absolute",
      top: 14,
      right: 14,
      width: CLOSE_SIZE,
      height: CLOSE_SIZE,
      borderRadius: CLOSE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
      zIndex: 3,
    },

    // --- Choosing a reason ------------------------------------------------
    /**
     * paddingRight clears the close button rather than guessing at it: the
     * button ends at 14 + CLOSE_SIZE, and the rest is breathing room. The same
     * trick the compose screen's title input uses.
     */
    header: {
      paddingLeft: 20,
      paddingRight: CLOSE_SIZE + 28,
      paddingTop: 22,
      paddingBottom: 16,
    },
    title: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    subline: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
      marginTop: 4,
    },

    /**
     * A full-bleed rule, and the reason nothing pads the dialog itself.
     *
     * Each section carries its own padding so this can be an unpadded sibling
     * that reaches both edges. The alternative - padding the dialog and pulling
     * the rule back out with a negative margin - depends on clipping order
     * against `overflow: hidden`, which is exactly what the post detail screen's
     * exit documents as having gone wrong here before.
     *
     * A literal 1 rather than hairlineWidth: this app reserves the hairline for
     * separators BETWEEN rows of a list, and uses a full pixel for the rules
     * that divide a card into sections.
     */
    rule: {
      height: 1,
      backgroundColor: colors.border,
    },

    listScroll: {
      flexShrink: 1,
    },
    list: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 8,
    },
    reasonGroup: {
      gap: 8,
    },
    /**
     * r14, the CONTROL radius - the same one the submit button below takes, and
     * deliberately not the r26 of the dialog around it.
     *
     * 16 of horizontal padding is load-bearing rather than decorative: it is the
     * gap between the checkbox and the tinted edge that appears the moment a row
     * is selected, and without it the box sits flush against its own highlight.
     */
    reason: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    reasonSelected: {
      backgroundColor: colors.dangerTint,
      borderColor: colors.dangerEdge,
    },
    reasonLabel: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.text,
    },
    reasonLabelSelected: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.danger,
    },
    /**
     * Square with a soft radius, not a circle.
     *
     * It LOOKS like a checkbox and BEHAVES like a radio - picking one reason
     * clears the last, because a report carries exactly one. The shape is the
     * design's; the semantics are the behaviour's, and the accessibility role in
     * the dialog follows the behaviour.
     */
    box: {
      width: BOX_SIZE,
      height: BOX_SIZE,
      borderRadius: 7,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    boxSelected: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
    },

    /** The compose screen's caption input, at the dialog's smaller type size. */
    detail: {
      minHeight: 76,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
      // Android centres a multiline input's text vertically without this, so a
      // one-line draft floats in the middle of a 76pt box.
      textAlignVertical: "top",
    },
    /** Right-aligned, unlike the compose screen's, which sits under a full-width field. */
    counter: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "right",
      paddingTop: 6,
      paddingHorizontal: 2,
    },

    // --- Confirmation, and the already-reported screen ---------------------
    stateBody: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 34,
      paddingBottom: 6,
    },
    stateCircle: {
      width: STATE_CIRCLE,
      height: STATE_CIRCLE,
      borderRadius: STATE_CIRCLE / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    stateCircleDone: {
      backgroundColor: colors.successTint,
      borderColor: colors.successEdge,
    },
    stateCircleReported: {
      backgroundColor: colors.dangerTint,
      borderColor: colors.dangerEdge,
    },
    stateTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
      textAlign: "center",
      marginTop: 16,
    },
    stateText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 6,
    },

    // --- Error ------------------------------------------------------------
    /** The compose screen's error box, inset to the dialog's own padding. */
    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 16,
      marginTop: 16,
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

    // --- Buttons ----------------------------------------------------------
    footer: {
      padding: 16,
      gap: 10,
    },
    // Sizing and clipping only, for the reason the compose screen's submit
    // gives: centring here would collapse the gradient child to the width of
    // its label instead of filling the button.
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
    /** Destructive, but quiet - the tint pair, not a solid red. */
    secondary: {
      height: 54,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    secondaryLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.danger,
    },
  });

  return styles;
};

export {
  REPORT_CLOSE_ICON_SIZE,
  REPORT_CHECK_ICON_SIZE,
  REPORT_STATE_ICON_SIZE,
  REPORT_STATE_FLAG_SIZE,
};
