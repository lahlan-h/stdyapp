import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button, and its glyph - the same as edit-profile's. */
const BACK_SIZE = 40;
const ANALYTICS_BACK_ICON_SIZE = 18;

/** Icons inside stat tiles and the trend line. */
const ANALYTICS_ICON_SIZE = 16;

/**
 * Plot heights. Fixed rather than proportional to the screen, so a bar of a
 * given value is the same height on every phone and the two charts can be
 * compared by eye.
 */
const DAILY_CHART_HEIGHT = 140;
const HOURLY_CHART_HEIGHT = 80;

/**
 * Gap between bars. 2px of surface between fills is what keeps adjacent bars
 * reading as separate values rather than one lumpy block - see the dataviz
 * mark specs. 30 bars on a narrow phone still leave each one ~8px wide.
 */
const BAR_GAP = 2;

/** Rounded data-end on bars, anchored flat to the baseline. */
const BAR_RADIUS = 4;

/**
 * Bars never render shorter than this when their value is above zero, so a
 * 2-minute day is visibly "some" rather than indistinguishable from nothing.
 * A zero stays zero.
 */
const MIN_VISIBLE_BAR = 3;

/**
 * Analytics: a scrolling column of cards under a range switch. Card, header
 * and segment values follow settings and edit-profile, so the screen reads as
 * part of the same app rather than a dashboard bolted onto it.
 */
export const createAnalyticsStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 16,
    },

    // --- Header ---
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

    // --- Range switch --- (the settings theme control's shape)
    segmentGroup: {
      flexDirection: "row",
      gap: 6,
      padding: 4,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 9,
      borderRadius: 10,
    },
    segmentSelected: {
      backgroundColor: colors.primary,
    },
    segmentLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    // White in both themes: it sits on colors.primary, a mid blue either way.
    // See segmentLabelSelected in settings.styles.ts.
    segmentLabelSelected: {
      color: "#ffffff",
    },

    // --- Cards ---
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
    },
    cardTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    cardFootnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },

    // --- Hero number ---
    heroValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 40,
      color: colors.text,
    },
    trendRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    // Trend text stays in text ink; the arrow beside it carries the colour, so
    // the direction never depends on colour alone.
    trendText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // --- Bar charts ---
    chartReadout: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
      minHeight: 18,
    },
    chartPlot: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: BAR_GAP,
      // The one recessive rule on the chart: a baseline, no gridlines.
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    dailyPlot: { height: DAILY_CHART_HEIGHT },
    hourlyPlot: { height: HOURLY_CHART_HEIGHT },
    // Each column is the full plot height, so the tap target is the whole
    // column rather than a sliver of bar - short bars stay easy to hit.
    barColumn: {
      flex: 1,
      height: "100%",
      justifyContent: "flex-end",
    },
    bar: {
      backgroundColor: colors.primary,
      borderTopLeftRadius: BAR_RADIUS,
      borderTopRightRadius: BAR_RADIUS,
    },
    // Everything except the tapped bar steps back, rather than the tapped one
    // changing colour - one hue for one series.
    barDimmed: {
      opacity: 0.35,
    },
    axisRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    axisLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 11,
      color: colors.textMuted,
    },

    // --- Stat tiles ---
    tileGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    tile: {
      // Two per row: (100% - one 12px gap) / 2.
      flexBasis: "47%",
      flexGrow: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 4,
    },
    tileHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tileLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.textMuted,
    },
    tileValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 24,
      color: colors.text,
    },
    tileDetail: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
    },

    // --- Goal rows ---
    goalRow: { gap: 6 },
    goalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    goalLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    goalValue: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    meterTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    meterFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: colors.primary,
    },

    // --- States ---
    stateText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noticeText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
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
  });
  return styles;
};

/** Re-exported so the screen can size icons and compute bar heights to match. */
export {
  ANALYTICS_BACK_ICON_SIZE,
  ANALYTICS_ICON_SIZE,
  DAILY_CHART_HEIGHT,
  HOURLY_CHART_HEIGHT,
  MIN_VISIBLE_BAR,
};
