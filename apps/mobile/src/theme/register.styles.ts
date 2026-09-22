import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * The sign-up screen's own styles - ONLY what the login screen does not
 * already have. Everything the two share (banner, heading, Google button, OR
 * divider, fields, reveal, error box, submit, the link row) comes from
 * login.styles.ts, so the screens cannot drift apart one property at a time.
 */

/** The tick inside a passed check's ring. */
const REGISTER_CHECK_ICON_SIZE = 11;

/** A check's ring: the success badge's circle, at row size. */
const CHECK_MARK_SIZE = 18;

export const createRegisterStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // --- Name row ---
    // First and last name side by side, one field's width each.
    nameRow: {
      flexDirection: "row",
      gap: 12,
    },
    nameField: {
      flex: 1,
      gap: 8,
    },
    // "(optional)", nested inside the label in the footnote voice, so the
    // label reads as one line without competing with the field name.
    optional: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // A repeat that has been typed and does not match. Only the edge changes:
    // the checklist below already says why.
    inputInvalid: {
      borderColor: colors.danger,
    },

    // --- Checks panel ---
    /**
     * The one bordered block in the form, because it is the one thing that is
     * not a control: it reports on the fields above it. The input's fill and
     * r14 hairline, so it sits in the same family as they do.
     */
    checks: {
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    /**
     * Six of six: the whole panel takes the success tint/edge pair - the same
     * green the signed-in badge and the passed rings use - so "ready" reads
     * from the panel itself once its rows have folded away.
     */
    checksDone: {
      backgroundColor: colors.successTint,
      borderColor: colors.successEdge,
    },
    checksHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },
    checksTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
    },
    checksCount: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      lineHeight: 16,
      fontVariant: ["tabular-nums"],
      color: colors.textMuted,
    },
    checksTitleDone: {
      color: colors.success,
    },
    checksCountDone: {
      color: colors.success,
    },

    /**
     * The track is the border colour; the fill steps through danger, primary
     * and success as checks pass. Only a full bar is success green - the signal
     * Register waits for.
     */
    meter: {
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    meterFill: {
      height: "100%",
      borderRadius: 999,
    },
    meterLow: { backgroundColor: colors.danger },
    meterPartial: { backgroundColor: colors.primary },
    meterDone: { backgroundColor: colors.success },

    /**
     * What slides shut at six of six. overflow hidden so the rows are cropped
     * as the height animates rather than spilling over the button below.
     */
    detail: {
      overflow: "hidden",
    },
    // Measured for its natural height. No flex, so the animating parent's
    // shrinking height crops it rather than squeezing it.
    detailInner: {
      gap: 14,
    },
    group: {
      gap: 8,
    },
    groupLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    // An empty ring when unmet; the success tint/edge pair with a tick when met.
    checkMark: {
      width: CHECK_MARK_SIZE,
      height: CHECK_MARK_SIZE,
      borderRadius: CHECK_MARK_SIZE / 2,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkMarkPassed: {
      backgroundColor: colors.successTint,
      borderColor: colors.successEdge,
    },
    checkText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    checkTextPassed: {
      color: colors.text,
    },
  });
  return styles;
};

export { REGISTER_CHECK_ICON_SIZE };
