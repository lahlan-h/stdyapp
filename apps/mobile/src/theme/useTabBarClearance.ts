import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Air under a tab's last row, on top of the room the native bar takes. */
const TAB_CONTENT_ROOM = 16;

/**
 * How much of a tab's bottom edge the native tab bar covers.
 *
 * iOS: every tab is its own view controller with its own safe area, and the
 * Liquid Glass bar - its bottom accessory too - is part of that safe area. So
 * the tab's bottom inset IS the bar, home indicator included. Automatic
 * content insets are switched off in the tabs layout, because they cleared
 * the bar on some screens and not others; this is applied by hand instead.
 *
 * Android: native tabs lay a tab's content out above the bar already, so there
 * is nothing to clear.
 */
export const useTabBarInset = (): number => {
  const insets = useSafeAreaInsets();
  return Platform.OS === "ios" ? insets.bottom : 0;
};

/**
 * What a scrolling tab leaves clear at the bottom so its last row scrolls out
 * from under the native tab bar. Add breathing room to the result; never use
 * it as breathing room.
 */
export const useTabBarClearance = (): number => useTabBarInset() + TAB_CONTENT_ROOM;
