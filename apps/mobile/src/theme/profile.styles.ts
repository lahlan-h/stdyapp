import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the profile avatar. Larger than the feed's, which is AVATAR_SIZE in home.styles. */
const AVATAR_SIZE = 96;

/** Leading icon on an action button. */
export const PROFILE_ACTION_ICON_SIZE = 16;

/** Icon in the study card's two figures. */
export const PROFILE_STUDY_ICON_SIZE = 18;

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
    actions: {
      flexDirection: "row",
      gap: 10,
      paddingTop: 4,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 10,
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

    // --- Stats row ---
    // Deliberately NOT a card: the figures read as part of the header block
    // above them, and boxing them would put a third border between the name and
    // the first post.
    stats: {
      flexDirection: "row",
      justifyContent: "center",
      paddingTop: 4,
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

    // --- Study card ---
    studyCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 16,
      overflow: "hidden",
    },
    studyFigure: {
      flex: 1,
      alignItems: "center",
      gap: 4,
    },
    studyValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    studyValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 20,
      color: colors.text,
    },
    studyLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    studyDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      marginVertical: 2,
      backgroundColor: colors.border,
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
