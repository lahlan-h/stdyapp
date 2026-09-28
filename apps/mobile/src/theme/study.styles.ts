import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * Diameter of the focus dial. Fixed rather than a share of the screen width:
 * it holds a clock that must stay legible on an SE, and the column around it
 * absorbs the difference on bigger phones.
 */
export const DIAL_SIZE = 240;

/** How many tick marks make up the dial's ring. 60 reads as a clock face. */
export const DIAL_TICKS = 60;

const TICK_WIDTH = 3;
const TICK_HEIGHT = 14;

export const STUDY_ICON_SIZE = 18;

/** Air under the last control, on top of the tab bar clearance. */
export const STUDY_FOOTER_ROOM = 32;

export const createStudyStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      // No paddingBottom: the last control must clear the floating tab bar,
      // and that distance is a runtime safe-area value the screen supplies.
      gap: 18,
    },

    // ---- header ---------------------------------------------------------
    header: { gap: 2 },
    screenTitle: {
      fontSize: 30,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.6,
    },
    screenSubtitle: { fontSize: 14, color: colors.textMuted },

    // ---- dial -----------------------------------------------------------
    dialWrap: { alignItems: "center", paddingVertical: 4 },
    dial: {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    /**
     * A full-size layer holding one tick at its top edge. Rotating the LAYER is
     * what puts the tick on the circle: React Native rotates a view about its
     * own centre, so no trigonometry or measured layout is involved.
     */
    tickTrack: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
    },
    tick: {
      width: TICK_WIDTH,
      height: TICK_HEIGHT,
      borderRadius: TICK_WIDTH / 2,
      backgroundColor: colors.border,
    },
    dialCenter: { alignItems: "center", paddingHorizontal: 30 },

    dialValue: {
      fontSize: 46,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -1.5,
      fontVariant: ["tabular-nums"],
    },
    dialScore: {
      fontSize: 60,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -2,
      fontVariant: ["tabular-nums"],
    },
    dialCaption: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginTop: 4,
    },

    /** The "Solid focus" pill under the dial - a dot plus a word. */
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      alignSelf: "center",
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, fontWeight: "600", color: colors.text },

    // ---- duration picker -------------------------------------------------
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    chipRow: { flexDirection: "row", gap: 8 },
    chip: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      backgroundColor: colors.bg,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 14, fontWeight: "600", color: colors.text },
    /** Sits on the filled chip, which is `primary` in both themes. */
    chipTextSelected: { color: colors.surface },

    customRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    customInput: {
      flex: 1,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      color: colors.text,
      fontSize: 15,
      fontVariant: ["tabular-nums"],
    },
    customUnit: { fontSize: 14, color: colors.textMuted },

    helpText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

    /** The 🎉 at the top of the recap. Carries the celebration on its own. */
    heroEmoji: { fontSize: 44, textAlign: "center" },

    /**
     * Two reward cards side by side - XP and streak.
     *
     * Their own shape rather than more rows, because they are the payoff and
     * the rows are the report. A reward that looks like a statistic is not a
     * reward.
     */
    rewardRow: { flexDirection: "row", gap: 10 },
    rewardCard: {
      flex: 1,
      alignItems: "center",
      gap: 2,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rewardEmoji: { fontSize: 22 },
    rewardValue: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    rewardLabel: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
    },

    /** Band name shown inline beside the score, e.g. "Deep focus" next to 84. */
    bandChip: {
      paddingVertical: 3,
      paddingHorizontal: 9,
      borderRadius: 999,
      marginRight: 8,
    },
    bandChipText: { fontSize: 11, fontWeight: "700" },

    /** A single warning chip under the dial, shown only when there is one. */
    warnChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "center",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    warnChipText: { fontSize: 12, fontWeight: "600", color: colors.danger },

    // ---- recap rows ------------------------------------------------------
    recapHeader: { alignItems: "center", gap: 4, paddingTop: 4 },
    recapTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.4,
    },
    recapSubtitle: { fontSize: 14, color: colors.textMuted },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 13,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    rowIcon: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text },
    rowValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    /** Small coloured pill beside a value, e.g. the band name next to a score. */
    badge: {
      paddingVertical: 3,
      paddingHorizontal: 9,
      borderRadius: 999,
      marginRight: 8,
    },
    badgeText: { fontSize: 11, fontWeight: "700" },

    // ---- trace -----------------------------------------------------------
    traceCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
    traceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    traceTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
    traceMeta: { fontSize: 11, color: colors.textMuted },
    tracePlot: {
      height: 72,
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 2,
      backgroundColor: colors.bg,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    traceBar: { flex: 1, borderRadius: 2, minWidth: 2 },
    traceAxis: { flexDirection: "row", justifyContent: "space-between" },

    // ---- rating ----------------------------------------------------------
    ratingWrap: { alignItems: "center", gap: 6, paddingVertical: 8 },
    ratingIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    ratingQuestion: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      letterSpacing: -0.4,
    },
    ratingHint: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
    ratingRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    ratingButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    ratingButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    ratingText: { fontSize: 17, fontWeight: "600", color: colors.text },
    ratingTextSelected: { color: colors.surface },

    // ---- actions ---------------------------------------------------------
    action: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    actionDisabled: { opacity: 0.45 },
    actionText: { fontSize: 16, fontWeight: "700", color: colors.surface },

    /** End session: destructive, but it sits over content and must not shout. */
    actionDanger: {
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    actionDangerText: { color: colors.danger },

    linkButton: { alignItems: "center", paddingVertical: 12 },
    linkText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },

    // ---- error -----------------------------------------------------------
    errorBox: {
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
      borderRadius: 12,
      padding: 12,
    },
    errorText: { fontSize: 13, color: colors.danger },
  });

  return styles;
};
