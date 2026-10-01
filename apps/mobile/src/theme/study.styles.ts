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

/** Row height of the duration wheels, and the distance they snap by. */
export const WHEEL_ITEM_HEIGHT = 44;

/** Rows visible at once. Odd, so there is a true middle to select in. */
export const WHEEL_VISIBLE_ITEMS = 5;


/** Where the chart's horizontal grid sits, as % from the bottom. */
export const TRACE_GRID_LINES = [25, 50, 75] as const;

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

    /** Shown mid-session only when the user has actually been away. */
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

    // ---- duration picker -------------------------------------------------
    pickerWrap: { justifyContent: "center" },
    pickerRow: { flexDirection: "row" },
    /**
     * The lane the chosen row sits in, drawn BEHIND the wheels and spanning
     * all three - as on iOS, where one highlight reads as a single selection
     * rather than three separate ones.
     */
    wheelLane: {
      position: "absolute",
      left: 0,
      right: 0,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    // Height is set by the component, which knows whether it is compact.
    wheel: { flex: 1 },
    wheelItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    wheelNumber: {
      fontSize: 23,
      fontWeight: "600",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    /** Unselected rows recede rather than disappear, so the wheel reads as one. */
    wheelNumberDim: { color: colors.textMuted, fontWeight: "400" },
    wheelUnit: { fontSize: 13, color: colors.textMuted },


    helpText: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

    /** The chosen length, read back under the dial now the dial holds a wheel. */
    plannedCaption: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textMuted,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },

    /** The 🎉 at the top of the recap. Carries the celebration on its own. */
    heroEmoji: { fontSize: 40, textAlign: "center" },

    recapHeader: { alignItems: "center", gap: 3 },
    recapTitle: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.text,
      letterSpacing: -0.5,
    },
    recapSubtitle: { fontSize: 14, color: colors.textMuted },

    /**
     * ONE CARD PER METRIC, rather than rows inside a single card.
     *
     * Each number is a separate thing the user might care about, and separate
     * cards let the eye land on one without reading the others. A grouped list
     * reads as a settings screen; this reads as a scoreboard.
     */
    metricCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 15,
      paddingHorizontal: 15,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricIcon: { width: 22, alignItems: "center" },
    metricLabel: { flex: 1, fontSize: 15, color: colors.textMuted },
    metricValue: {
      fontSize: 19,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },

    /** The "Deep focus" pill that sits beside the score in its card. */
    bandPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: 999,
      marginRight: 10,
    },
    bandPillText: { fontSize: 13, fontWeight: "600" },
    bandDot: { width: 7, height: 7, borderRadius: 3.5 },

    // ---- rewards ---------------------------------------------------------
    rewardRow: { flexDirection: "row", gap: 10 },
    rewardCard: {
      flex: 1,
      gap: 3,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rewardTop: { flexDirection: "row", alignItems: "center", gap: 7 },
    rewardEmoji: { fontSize: 17 },
    rewardValue: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
    rewardCaption: { fontSize: 12, color: colors.textMuted },

    // ---- trace -----------------------------------------------------------
    traceCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 15,
      gap: 10,
    },
    traceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    traceTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
    traceAvg: {
      fontSize: 12,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },

    tracePlotRow: { flexDirection: "row", gap: 8 },
    tracePlot: {
      flex: 1,
      height: 104,
      borderRadius: 10,
      backgroundColor: colors.bg,
      paddingHorizontal: 6,
      paddingVertical: 6,
      justifyContent: "flex-end",
    },
    /** Sits behind the bars so a bar's height can be read as a value. */
    traceGrid: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.border,
    },
    traceBars: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 2,
      height: "100%",
    },
    traceBar: { flex: 1, borderRadius: 2, minWidth: 2 },

    traceYAxis: { justifyContent: "space-between", paddingVertical: 4, width: 26 },
    traceXAxis: { flexDirection: "row", justifyContent: "space-between" },
    traceTick: {
      fontSize: 10,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },

    // ---- rating sheet ----------------------------------------------------
    sheetBackdrop: { flex: 1, backgroundColor: colors.scrim },
    /**
     * Anchored to the bottom and taller than it looks: the extra height is
     * dragged off-screen, so a downward drag never lifts the sheet's own
     * bottom edge above the screen and exposes the backdrop under it.
     */
    sheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      paddingTop: 10,
      paddingHorizontal: 22,
      gap: 6,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    sheetHandle: {
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    sheetIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 6,
    },
    sheetTitle: {
      fontSize: 25,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      letterSpacing: -0.4,
      lineHeight: 31,
    },
    sheetLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    sheetHint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 14,
      marginBottom: 12,
    },

    ratingRow: { flexDirection: "row", gap: 11, marginTop: 10 },
    ratingButton: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    ratingButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    ratingText: { fontSize: 17, fontWeight: "600", color: colors.text },
    ratingTextSelected: { color: colors.surface },

    // ---- actions ---------------------------------------------------------
    action: {
      alignSelf: "stretch",
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

    /**
     * The second action, and a real button rather than a text link.
     *
     * It was a faint link, and that was a genuine dead end: finishing a
     * session left "Save privately" as the only way back to the start screen,
     * in muted grey, reading as a save rather than as "done". The way out of a
     * flow has to look like a control.
     */
    actionSecondary: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionSecondaryText: { fontSize: 16, fontWeight: "600", color: colors.text },

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
