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

/** Icon size inside a checklist row. One token, not a per-call guess. */
export const TASK_ICON_SIZE = 16;

/**
 * Minimum size of anything tappable.
 *
 * Apple's floor is 44pt and Material's is 48dp; 44 is the value every row,
 * button and input on this screen is measured against.
 */
export const TOUCH_MIN = 44;

/** Row height of the duration wheels, and the distance they snap by. */
export const WHEEL_ITEM_HEIGHT = 44;

/** Rows visible at once. Odd, so there is a true middle to select in. */
export const WHEEL_VISIBLE_ITEMS = 5;


/** Where the chart's horizontal grid sits, as % from the bottom. */
export const TRACE_GRID_LINES = [25, 50, 75] as const;

/** Air under the last control, on top of the tab bar clearance. */
export const STUDY_FOOTER_ROOM = 32;

/** The chevron on a Begin card row that starts something. */
export const BEGIN_CHEVRON_SIZE = 18;

/**
 * The big Start button that is slid along its track to lock in - large
 * enough to hold with a thumb, and to read as the screen's one big action.
 */
export const LOCK_IN_THUMB_SIZE = 64;
const LOCK_IN_TRACK_PADDING = 6;

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

    /** Mid-session, when an absence was credited as phone-down time. */
    calmChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "center",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.successTint,
      borderWidth: 1,
      borderColor: colors.successEdge,
    },
    calmChipText: { fontSize: 12, fontWeight: "600", color: colors.success },

    /**
     * Face-down mode. Pure black, not a dimmed theme colour: on an OLED screen
     * black pixels are switched off, which is what makes keeping the screen
     * awake face-down cheap.
     */
    phoneDownOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "#000000",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      zIndex: 10,
    },
    phoneDownText: { fontSize: 15, fontWeight: "600", color: "#3A3A3A" },
    phoneDownHint: { fontSize: 12, color: "#2A2A2A" },

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

    // ---- checklist -------------------------------------------------------
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    cardCount: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },

    /**
     * The WHOLE ROW is the hit target, not the little box: 44pt tall and
     * full width, so ticking something off needs no aim at all. Anything that
     * makes ticking feel fiddly costs us the signal it produces.
     */
    taskRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 6,
    },
    /** Pressed feedback. Opacity rather than scale, so no layout moves. */
    rowPressed: { opacity: 0.6 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
    },
    checkboxChecked: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    taskTitle: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 20 },
    /**
     * Struck through AND dimmed. Colour alone would be the only thing marking
     * an item done, which fails anyone who cannot distinguish it.
     */
    taskTitleDone: {
      color: colors.textMuted,
      textDecorationLine: "line-through",
    },
    taskRemove: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },

    taskAddRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
    taskInput: {
      flex: 1,
      minHeight: TOUCH_MIN,
      paddingHorizontal: 14,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      color: colors.text,
      fontSize: 15,
    },
    taskAddButton: {
      width: TOUCH_MIN,
      height: TOUCH_MIN,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },

    /** The chosen length, read back under the dial now the dial holds a wheel. */
    plannedCaption: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textMuted,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },

    /**
     * ONE CARD PER METRIC, rather than rows inside a single card - used by a
     * past session's detail screen.
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
    /**
     * An interval spent in another app: full height, so time away reads as a
     * block the eye cannot miss rather than one more short bar.
     */
    traceAwayBar: {
      flex: 1,
      minWidth: 2,
      height: "100%",
      borderRadius: 2,
      backgroundColor: colors.danger,
      // Translucent so the block reads as a region of time, not a 100% score;
      // strong enough that it cannot be mistaken for the empty plot behind it.
      opacity: 0.55,
    },
    /** An interval with the phone down on the desk: present, just not looking. */
    traceDownBar: {
      flex: 1,
      minWidth: 2,
      height: "100%",
      borderRadius: 2,
      backgroundColor: colors.primary,
      opacity: 0.28,
    },
    /**
     * An interval on one of the session's breaks: a quiet grey block, so it
     * reads as time set aside rather than time won or lost.
     */
    traceBreakBar: {
      flex: 1,
      minWidth: 2,
      height: "100%",
      borderRadius: 2,
      backgroundColor: colors.textMuted,
      opacity: 0.22,
    },
    /** A one-line "where the time went" strip under the plot. */
    traceRibbon: {
      flexDirection: "row",
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      gap: 2,
    },
    traceRibbonPart: { height: "100%" },
    traceLegend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 },
    traceLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    traceLegendDot: { width: 8, height: 8, borderRadius: 4 },
    traceLegendText: {
      fontSize: 12,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    traceLegendStrong: { color: colors.text, fontWeight: "600" },
    traceLiveTag: { fontSize: 11, fontWeight: "600", color: colors.success },

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

    // Break and End side by side under the dial: the two things a running
    // session is controlled by, equal halves of one row.
    controlRow: { flexDirection: "row", gap: 10, alignSelf: "stretch" },
    controlButton: { flex: 1, alignSelf: "auto" },

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

    // ---- group session ---------------------------------------------------
    /** "Studying with <group>" above Start, and the invite code mid-session. */
    groupChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "center",
      minHeight: 36,
      paddingLeft: 14,
      paddingRight: 6,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    groupChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
    groupChipCode: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 1.5,
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    /** A one-line note under a centred control, like the invite chip. */
    centeredText: { textAlign: "center" },
    groupChipClear: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },

    // ---- who is in the room ---------------------------------------------
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 4,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.bg,
    },
    // Away is dimmed AND labelled, so it never rests on opacity alone.
    avatarAway: { opacity: 0.45 },
    personName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
    personMeta: { fontSize: 12, color: colors.textMuted },

    // ---- history ---------------------------------------------------------
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 8,
    },
    historyDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    historyText: { flex: 1, gap: 2 },
    historyTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
    historyMeta: { fontSize: 12, color: colors.textMuted },
    historyValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },

    // ---- Sessions | Routines switch --------------------------------------
    // The analytics range switch's shape, so the two read as one control.
    viewSwitch: {
      flexDirection: "row",
      gap: 6,
      padding: 4,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewSwitchItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 38,
      borderRadius: 10,
    },
    viewSwitchItemSelected: { backgroundColor: colors.primary },
    viewSwitchLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    // White in both themes: it sits on colors.primary, a mid blue either way.
    viewSwitchLabelSelected: { color: "#ffffff" },
    /** "A session is running" on the Sessions label, seen from Routines. */
    viewSwitchDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },

    // ---- Begin card -----------------------------------------------------
    beginCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 12,
    },
    beginTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 18,
      color: colors.text,
    },
    beginHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    // The streak, as the reason to begin.
    streakPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      flexShrink: 1,
    },
    streakPillText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.text,
    },
    beginLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    beginCaption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // --- How long: chips, Custom opening the wheels ---
    // One row of equal chips: five lengths read as one choice, not a list.
    lengthChips: { flexDirection: "row", gap: 6 },
    lengthChip: {
      flex: 1,
      minHeight: 40,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    lengthChipSelected: {
      backgroundColor: colors.primaryTint,
      borderColor: colors.primary,
    },
    lengthChipText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      color: colors.text,
    },
    lengthChipTextSelected: { color: colors.primary },

    // --- Studying with ---
    withRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    withText: { flex: 1, gap: 2 },
    withValue: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },

    // --- The lock-in track: the big Start button, slid across ---
    lockInWrap: { gap: 8, marginTop: 4 },
    lockInTrack: {
      height: LOCK_IN_THUMB_SIZE + LOCK_IN_TRACK_PADDING * 2,
      borderRadius: (LOCK_IN_THUMB_SIZE + LOCK_IN_TRACK_PADDING * 2) / 2,
      justifyContent: "center",
      padding: LOCK_IN_TRACK_PADDING,
      backgroundColor: colors.primaryTint,
      borderWidth: 1,
      borderColor: colors.primaryEdge,
    },
    // Centred in the space right of the thumb, so the words never sit under it.
    lockInLabelRow: {
      position: "absolute",
      left: LOCK_IN_THUMB_SIZE + LOCK_IN_TRACK_PADDING,
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    lockInLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 16,
      color: colors.primary,
      letterSpacing: 0.2,
    },
    lockInThumbWrap: {
      width: LOCK_IN_THUMB_SIZE,
      height: LOCK_IN_THUMB_SIZE,
    },
    // The thumb's glow, swelling behind it - drawn outside its box, unclipped.
    lockInHalo: {
      position: "absolute",
      top: 0,
      left: 0,
      width: LOCK_IN_THUMB_SIZE,
      height: LOCK_IN_THUMB_SIZE,
      borderRadius: LOCK_IN_THUMB_SIZE / 2,
      backgroundColor: colors.primary,
    },
    lockInThumb: {
      width: LOCK_IN_THUMB_SIZE,
      height: LOCK_IN_THUMB_SIZE,
      borderRadius: LOCK_IN_THUMB_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    // Optically centred: a play triangle's weight sits left of its box.
    lockInThumbIcon: { marginLeft: 3 },
    lockInHint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
    },
    lockInBusy: {
      height: LOCK_IN_THUMB_SIZE + LOCK_IN_TRACK_PADDING * 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },

    // --- The 3, 2, 1 ---
    // The scrim's dark in both themes, for the scrim's reason: it is there to
    // push everything behind it away.
    countdown: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      paddingHorizontal: 32,
      backgroundColor: colors.lightbox.bg,
    },
    countdownNumber: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 140,
      lineHeight: 160,
      color: colors.lightbox.text,
      fontVariant: ["tabular-nums"],
    },
    countdownGo: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 56,
      lineHeight: 160,
      color: colors.lightbox.text,
    },
    countdownLine: {
      minHeight: 22,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      color: colors.lightbox.text,
      opacity: 0.7,
      textAlign: "center",
    },
    countdownCancel: {
      position: "absolute",
      bottom: 80,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 999,
      backgroundColor: colors.lightbox.control,
    },
    countdownCancelText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.lightbox.text,
    },

    // --- Picking who you study with ---
    // Stretched for full-width rows - so the handle, which centres itself
    // under the rating sheet's alignItems, is centred by hand here.
    pickSheet: { alignItems: "stretch", maxHeight: "70%" },
    pickHandle: { alignSelf: "center" },
    pickList: { alignSelf: "stretch" },
    pickListContent: { gap: 8, paddingVertical: 10 },
    pickRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    pickRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryTint,
    },
  });

  return styles;
};
