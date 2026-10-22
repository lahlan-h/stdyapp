import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button, as on edit profile. */
const BACK_SIZE = 40;
const PLANS_BACK_ICON_SIZE = 18;
/** The tick beside each feature, and the icons in the notices. */
const PLANS_ICON_SIZE = 16;

/**
 * Pick a plan: two stacked plan cards under a heading, with notices above
 * them. The header, error box and gradient button follow editProfile.styles.ts
 * so the screen reads as one of the app's own.
 */
export const createPlansStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 40,
      gap: 18,
      // Two cards side by side would be cramped on a phone and a one-line
      // reading width on a desktop browser; a capped column suits both.
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
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
    heading: { gap: 6 },
    screenTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
    },
    subline: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 21,
      color: colors.textMuted,
    },

    // --- Plan card ---
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 18,
      gap: 14,
    },
    // The plan the user is on - outlined, so it is findable at a glance
    // without a second colour competing with the buttons.
    cardCurrent: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    planName: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 20,
      color: colors.text,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    // White on primary in both themes - see segmentLabelSelected in
    // settings.styles.ts for why.
    badgeText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      letterSpacing: 0.4,
      color: "#ffffff",
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 6,
    },
    price: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 34,
      color: colors.text,
    },
    cadence: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      color: colors.textMuted,
    },
    tagline: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
    },
    features: { gap: 8 },
    feature: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    featureText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
    },
    status: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    finePrint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      textAlign: "center",
    },

    // --- Buttons --- (centring on the fill, for newPost.styles.ts's reason)
    primary: {
      height: 52,
      borderRadius: 14,
      overflow: "hidden",
    },
    primaryFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
    },
    secondary: {
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    destructive: {
      borderColor: colors.dangerEdge,
      backgroundColor: colors.dangerTint,
    },
    destructiveLabel: {
      color: colors.danger,
    },
    disabled: { opacity: 0.45 },

    // --- Notices ---
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    noticeError: {
      backgroundColor: colors.dangerTint,
      borderColor: colors.dangerEdge,
    },
    noticeText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
    },
    noticeTextError: {
      color: colors.danger,
    },
    noticeAction: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.primary,
    },
  });
  return styles;
};

export { PLANS_BACK_ICON_SIZE, PLANS_ICON_SIZE };
