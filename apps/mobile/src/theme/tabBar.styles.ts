import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/**
 * Size of a tab's icon. 23 rather than the 25 four tabs had: five labels share
 * the width now, and "Analytics" is the longest of them.
 */
const TAB_ICON_SIZE = 23;

/** The visible bar, not counting the safe-area inset below it. */
const BAR_HEIGHT = 56;

/**
 * How tall the bar DRAWS ITSELF - not what a screen has to leave clear.
 *
 * The bar is absolutely positioned so content scrolls on behind its blur,
 * which means it takes no layout space and content would otherwise scroll
 * underneath it and stop there. (It was positioned for the add-post circle's
 * overhang; the circle has moved to the Feed, the blur is why it stays.)
 *
 * BUT THIS IS NOT THE WHOLE CLEARANCE, and reading it as such is a mistake this
 * has already caused once. The container adds `paddingBottom: insets.bottom`
 * beneath everything measured here, so the space the bar really occupies is
 * this plus the safe-area inset - and a screen that padded its scroller by this
 * number alone left the last row's controls sitting under the bar, visible and
 * untappable.
 *
 * A scrolling screen wants useTabBarClearance(), which adds the inset. This
 * constant is for the bar's own layout, and for that it is exactly right.
 */
const TAB_BAR_HEIGHT = BAR_HEIGHT;

export const createTabBarStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
    },
    // The bar people actually see, behind the row of tabs.
    surface: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.backgrounds.tabBar,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    row: {
      height: BAR_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
    },
    // Five equal columns, one per tab.
    tab: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    label: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 10,
      color: colors.textMuted,
    },
    labelSelected: {
      color: colors.primary,
    },
  });
  return styles;
};

/** Re-exported so components can size their icons to match the stylesheet. */
export { TAB_ICON_SIZE, TAB_BAR_HEIGHT };
