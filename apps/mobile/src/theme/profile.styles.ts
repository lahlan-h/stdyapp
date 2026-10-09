import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the profile avatar. Larger than the feed's, which is AVATAR_SIZE in home.styles. */
const AVATAR_SIZE = 96;

/** Leading icon on an action button. */
export const PROFILE_ACTION_ICON_SIZE = 16;

/** Icon in the study card's two figures. */
export const PROFILE_STUDY_ICON_SIZE = 18;

/**
 * The back control on someone else's profile - the same 40px circle and 18px
 * chevron analytics and edit-profile draw, so every pushed screen's way back
 * looks and sits the same.
 */
const BACK_SIZE = 40;
export const PROFILE_BACK_ICON_SIZE = 18;

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
    header: {
      alignItems: "center",
      gap: 10,
      paddingTop: 12,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    identity: {
      alignItems: "center",
      gap: 2,
    },
    displayName: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 24,
      color: colors.text,
      textAlign: "center",
    },
    username: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
    },
    bio: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
      textAlign: "center",
      paddingHorizontal: 8,
      paddingTop: 4,
    },

    // --- Actions ---
    // Stacked rather than side by side, and centred under the name.
    actions: {
      alignItems: "center",
      gap: 8,
      paddingTop: 4,
    },
    // A shared minimum width is what makes the stack read as one control
    // rather than two pills of different lengths: "Edit profile" and "Sign out"
    // are six characters apart, so intrinsic sizing would stagger their edges.
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minWidth: 190,
      paddingVertical: 11,
      paddingHorizontal: 18,
      borderRadius: 999,
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
    actionError: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.danger,
      textAlign: "center",
    },

    // --- Back bar (someone else's profile only) ---
    topBar: {
      flexDirection: "row",
      alignItems: "center",
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

    // --- Study bubble ---
    // Absolutely placed so the avatar stays CENTRED on the screen rather than
    // being pushed off-centre by a sibling in a row. The header is its
    // positioning parent.
    studyBubble: {
      position: "absolute",
      left: 0,
      top: 10,
      alignItems: "center",
      gap: 14,
      paddingVertical: 15,
      paddingHorizontal: 13,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    studyBubbleFigure: {
      alignItems: "center",
      gap: 3,
    },
    studyBubbleValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.text,
    },

    // The expanded panel, drawn OVER the header rather than displacing it - it
    // shares the bubble's anchor so it grows out of where the user tapped.
    // zIndex is what lifts it above the cards below; its wrapper carries one
    // too, or those later siblings would paint on top of it.
    // ⚠ The vertical metrics here MUST match studyBubble exactly - same top,
    // same paddingVertical, same gap, and rows that reuse studyBubbleFigure.
    // That is what keeps the icons and values from moving when it opens: only
    // the labels side grows, so the figures stay under the finger that tapped
    // them. paddingRight is the one dimension that differs, because that is
    // the side the labels appear on.
    studyPanel: {
      position: "absolute",
      left: 0,
      top: 10,
      gap: 14,
      paddingVertical: 15,
      paddingLeft: 13,
      paddingRight: 18,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      zIndex: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    // The figure keeps its stacked icon-over-value shape; the label sits beside
    // the pair rather than the three running in a line, which would drop every
    // value onto a different baseline than the collapsed bubble puts it on.
    studyPanelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    studyPanelLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    // Lifts the header (and so the panel inside it) above the cards that follow.
    headerArea: {
      zIndex: 1,
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
