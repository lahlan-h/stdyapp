import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** The avatar inside the profile card, sized to sit beside the name and counts. */
const CARD_AVATAR_SIZE = 64;

/** Leading icon on an action button. */
export const PROFILE_ACTION_ICON_SIZE = 16;

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

    // --- Actions ---
    // Stacked rather than side by side, and centred under the card.
    actions: {
      alignItems: "center",
      gap: 8,
      paddingTop: 4,
    },
    // A shared minimum width is what makes a stack read as one control rather
    // than pills of different lengths - Follow and Message on someone else's
    // profile - where intrinsic sizing would stagger their edges.
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

    // --- Top bar: back on someone else's profile, settings on your own ---
    topBar: {
      flexDirection: "row",
      alignItems: "center",
    },
    // Your own profile's title: the username, as the design draws it. It takes
    // the row, which is what pushes the gear to the far end.
    topBarTitle: {
      flex: 1,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
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

    // --- The profile card: avatar, name, counts and bio ---
    card: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 16,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    cardAvatar: {
      width: CARD_AVATAR_SIZE,
      height: CARD_AVATAR_SIZE,
      borderRadius: CARD_AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardIdentity: {
      flex: 1,
      gap: 8,
    },
    cardName: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 18,
      color: colors.text,
    },
    cardStats: {
      flexDirection: "row",
      gap: 22,
    },
    // Label over value, as the design stacks them.
    cardStat: {
      gap: 2,
    },
    cardStatLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    cardStatValue: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    cardField: {
      gap: 2,
    },
    cardFieldLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    cardFieldValue: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 21,
      color: colors.text,
    },

    // --- Posts ---
    // Title case and muted, as the design labels the list.
    sectionTitle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.textMuted,
      paddingHorizontal: 4,
      paddingTop: 8,
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

