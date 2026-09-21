import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_HEIGHT } from "./tabBar.styles";

/**
 * How much a scrolling screen must leave clear at the bottom to scroll its last
 * row out from under the tab bar.
 *
 * A HOOK rather than a constant because the answer is not knowable at module
 * load. The bar draws TAB_BAR_HEIGHT of itself and then pads by the safe-area
 * inset underneath - see TabBar's container - so what it actually occupies is
 * the sum, and the inset is a runtime value that differs between a phone with
 * gesture navigation, one with a three-button bar, and the same phone rotated.
 * Every stylesheet in this app is built once per palette at module load, so a
 * stylesheet physically cannot hold this number.
 *
 * That is the trap this exists to close. TAB_BAR_HEIGHT looks like the whole
 * answer and reads like it at a call site, and both screens that scroll under
 * the bar used it alone - so on any device with a non-zero inset the last card
 * in the feed had its action row cut in half by the bar, with the like, comment
 * and report buttons underneath it and untappable.
 *
 * Add breathing room to the result; never use it as breathing room.
 */
export const useTabBarClearance = (): number => {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom;
};
