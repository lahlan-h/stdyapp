import type { ColorScheme } from "./colors";
import { Platform, StyleSheet } from "react-native";

/**
 * The running session, as the tabs draw it. The tab bar itself is the native
 * one now and takes no styles from here.
 *
 * The floating bar - for platforms without iOS 26's accessory slot - and the
 * gap under it.
 */
const SESSION_BAR_HEIGHT = 60;
const SESSION_BAR_GAP = 8;

/**
 * What a scrolling screen adds to useTabBarClearance() while the session bar
 * is showing - see useSessionBarClearance.
 */
const SESSION_BAR_CLEARANCE = SESSION_BAR_HEIGHT + SESSION_BAR_GAP;

/** The chevron and bin in the session bar's two round buttons. */
const SESSION_BAR_ICON_SIZE = 20;

/** Those round buttons, inset from the bar's ends. */
const SESSION_BAR_BUTTON = 46;

/**
 * The native tab bar's height where the floating session bar has to clear it
 * by hand - Android's navigation bar and iOS's pre-26 bar. iOS 26 never needs
 * it: there the session sits in the bar's own accessory slot.
 */
const FALLBACK_TAB_BAR_HEIGHT = Platform.OS === "android" ? 80 : 49;

export const createTabBarStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // --- Running-session bar, in the native bar's accessory (iOS 26) ---
    // No background: the accessory is the bar's own Liquid Glass.
    accessory: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 18,
      paddingRight: 8,
    },
    accessoryOpen: {
      flex: 1,
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    accessoryInline: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 12,
    },
    // The palette's text colour rather than white: the glass follows light
    // and dark mode, unlike the floating bar's fixed blue.
    accessoryTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    accessoryCaption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    accessoryButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },

    // --- Running-session bar, floating (Android, iOS before 26) ---
    // Positioned by the tabs layout, just above the native bar.
    sessionBarOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
    },
    // Full width less a margin, unlike the pill, so it reads as the session
    // in progress rather than one more tab.
    sessionBar: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      height: SESSION_BAR_HEIGHT,
      marginHorizontal: 12,
      marginBottom: SESSION_BAR_GAP,
      paddingHorizontal: (SESSION_BAR_HEIGHT - SESSION_BAR_BUTTON) / 2,
      borderRadius: SESSION_BAR_HEIGHT / 2,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.primaryEdge,
    },
    // Everything but the bin opens the session, so the target is the bar.
    sessionBarOpen: {
      flex: 1,
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    sessionBarFill: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    // The scrim, not a new colour: a dark well that reads on the blue in both
    // themes, which is the job the scrim already does everywhere else.
    sessionBarButton: {
      width: SESSION_BAR_BUTTON,
      height: SESSION_BAR_BUTTON,
      borderRadius: SESSION_BAR_BUTTON / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.scrim,
    },
    sessionBarText: {
      flex: 1,
      gap: 1,
    },
    sessionBarTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sessionBarDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    // White in both themes: the bar is gradients.primary, the same blue in
    // each, as the tab bar's old add-post circle was.
    sessionBarTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
      fontVariant: ["tabular-nums"],
    },
    sessionBarCaption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: "#ffffff",
      opacity: 0.8,
    },
  });
  return styles;
};

/** Re-exported so components can size and place the session bar to match. */
export {
  SESSION_BAR_CLEARANCE,
  FALLBACK_TAB_BAR_HEIGHT,
  SESSION_BAR_ICON_SIZE,
};
