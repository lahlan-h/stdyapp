import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * Diameter of the profile avatar. Larger than the feed's, which is AVATAR_SIZE
 * in home.styles, and a little under the old centred 96: it shares its row with
 * the name now, and the name needs the width on a small phone.
 */
const AVATAR_SIZE = 84;

/** Leading icon on an action button. */
export const PROFILE_ACTION_ICON_SIZE = 16;

/** The circle around the lock on a private account's locked posts. */
const PROFILE_LOCK_BADGE_SIZE = 56;

/** The lock inside it, and the small one beside a private account's name. */
export const PROFILE_LOCK_ICON_SIZE = 24;
export const PROFILE_PRIVATE_BADGE_ICON_SIZE = 14;

/** Icon beside each figure in the study pill. */
export const PROFILE_STUDY_ICON_SIZE = 16;

/**
 * The back control on someone else's profile - the same 40px circle and 18px
 * chevron analytics and edit-profile draw, so every pushed screen's way back
 * looks and sits the same.
 */
const BACK_SIZE = 40;
export const PROFILE_BACK_ICON_SIZE = 18;

/**
 * The gear on your own profile. Bare rather than in the back control's circle,
 * as the design draws it, so it is sized up to hold the corner on its own.
 */
export const PROFILE_SETTINGS_ICON_SIZE = 26;

export const createProfileStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    // No paddingBottom: the screen adds useTabBarClearance() at runtime, which
    // a stylesheet built once per palette at module load cannot know. See the
    // hook - the bar's real footprint includes a safe-area inset.
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 20,
    },

    // --- Header ---
    // The avatar to the left with the name beside it, the way a contact card
    // reads, and the bio under both at full width.
    header: {
      gap: 12,
      paddingTop: 4,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // flex: 1 so a long name wraps inside the row rather than running off it.
    identity: {
      flex: 1,
      gap: 2,
    },
    displayName: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 24,
      color: colors.text,
    },
    username: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
    },
    // The username and, on a private account, a small lock after it.
    usernameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    bio: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
      paddingHorizontal: 2,
    },

    // --- Actions ---
    // Two to a row: your own four make a 2x2 grid, someone else's Follow and
    // Message one row. Wrapping rather than fixed rows, so either count lays
    // itself out.
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    // Half the row less the gap, so two always share one: equal cells are what
    // make the grid read as one control rather than pills of different lengths.
    actionButton: {
      flexBasis: "45%",
      flexGrow: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      color: colors.text,
    },
    actionLabelDanger: {
      color: colors.danger,
    },
    // Follow is the one action on someone else's profile, so it is the filled,
    // primary pill; once following it drops back to the plain outline, which is
    // what tells the two states apart at a glance before the label is read.
    actionButtonPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    // The page's ground rather than a fixed white - see chipLabelSelected in
    // homeSearch.styles, the same pale-blue-in-dark-mode problem.
    actionLabelOnPrimary: {
      color: colors.bg,
    },
    // Full width, so in the wrapping grid it takes a row of its own under the
    // button it is about rather than squeezing in as a third cell.
    actionError: {
      width: "100%",
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.danger,
      textAlign: "center",
    },

    // --- A follow request from this person, on their profile ---
    // The card recipe at the control radius, holding a sentence and the same
    // two-to-a-row pills as the actions under it, so Accept and Decline read
    // as actions rather than as a separate widget.
    requestCard: {
      gap: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    requestText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      textAlign: "center",
    },

    // --- A private account's locked posts, for a viewer it has not approved ---
    locked: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 32,
      paddingHorizontal: 24,
    },
    lockedBadge: {
      width: PROFILE_LOCK_BADGE_SIZE,
      height: PROFILE_LOCK_BADGE_SIZE,
      borderRadius: PROFILE_LOCK_BADGE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 4,
    },
    lockedTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
      textAlign: "center",
    },
    lockedText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
    },

    // --- Top bar: back on someone else's profile; the study pill, and the
    // gear on your own, at the far end ---
    // zIndex lifts it - and the pill's dropped-down panel - above the header
    // and the buttons below, which are later siblings and would otherwise
    // paint on top of the panel.
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      zIndex: 10,
    },
    // Pushes everything after it to the bar's far end.
    topBarSpacer: {
      flex: 1,
    },
    // Your own profile has nothing to go back to, so its one control sits at
    // the far end.
    topBarEnd: {
      justifyContent: "flex-end",
    },
    // The back control's footprint without its circle, so the tap target
    // stays 40px even though only the glyph is drawn.
    settingsButton: {
      width: BACK_SIZE,
      height: BACK_SIZE,
      alignItems: "center",
      justifyContent: "center",
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

    // --- Stats card ---
    stats: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      overflow: "hidden",
    },
    stat: {
      flex: 1,
      alignItems: "center",
      gap: 1,
    },
    statValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 19,
      color: colors.text,
    },
    statLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      marginVertical: 4,
      backgroundColor: colors.border,
    },

    // --- Study pill: the figures, in the top bar ---
    // The anchor the dropped-down panel is positioned against.
    studyPillAnchor: {
      position: "relative",
    },
    // The gear's height, so the bar's two controls sit on one line.
    studyPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      height: BACK_SIZE,
      paddingHorizontal: 14,
      borderRadius: BACK_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    // Edged in primary while its panel is down, so it reads as the control the
    // panel belongs to.
    studyPillOpen: {
      borderColor: colors.primary,
    },
    studyPillFigure: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    studyPillValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 14,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    // The labels, dropped under the pill from its right edge. Drawn OVER the
    // header rather than pushing it down; the top bar's zIndex is what lifts
    // it above the header and the buttons that follow.
    studyPanel: {
      position: "absolute",
      top: BACK_SIZE + 6,
      right: 0,
      minWidth: 190,
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    studyPanelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    studyPanelLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // --- Posts ---
    sectionTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    postList: {
      gap: 10,
    },

    // --- States ---
    centred: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 8,
    },
    message: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
    },
    retryLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.primary,
    },
  });
  return styles;
};

export { AVATAR_SIZE as PROFILE_AVATAR_SIZE };
