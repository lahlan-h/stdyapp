import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Size of a tab's icon. Three tabs leave room for the 25 the bar started with. */
const TAB_ICON_SIZE = 24;

/** The pill's own height. */
const PILL_HEIGHT = 62;

/** Inset between the pill's edge and the highlight behind the selected tab. */
const PILL_PADDING = 5;

/**
 * Width of one tab. Fixed rather than flex, so the pill hugs its tabs and
 * floats in the middle of the screen, as the design draws it, instead of
 * running edge to edge.
 */
const TAB_WIDTH = 74;

/** Air between the pill and the safe-area inset under it - what makes it float. */
const PILL_GAP = 8;

/**
 * The bar's visible top, measured up from the safe-area inset: the pill plus
 * the gap under it. The home screen's drop-down page stops here.
 */
const BAR_HEIGHT = PILL_HEIGHT + PILL_GAP;

/**
 * How tall the bar DRAWS ITSELF - not what a screen has to leave clear.
 *
 * The bar is absolutely positioned so content scrolls on behind the pill and
 * shows either side of it, which means it takes no layout space and content
 * would otherwise scroll underneath it and stop there.
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
    // Full width only so the pill can centre itself; the screen makes it
    // touch-transparent everywhere but the pill.
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
    },
    // overflow hidden is what rounds the blur behind the tabs to the pill.
    pill: {
      flexDirection: "row",
      height: PILL_HEIGHT,
      padding: PILL_PADDING,
      marginBottom: PILL_GAP,
      borderRadius: PILL_HEIGHT / 2,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    surface: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.backgrounds.tabBar,
    },
    tab: {
      width: TAB_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      borderRadius: (PILL_HEIGHT - PILL_PADDING * 2) / 2,
    },
    // The selected tab sits in a pill of its own, inside the bar's.
    tabSelected: {
      backgroundColor: colors.border,
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

/**
 * Re-exported so components can size their icons to match the stylesheet.
 *
 * BAR_HEIGHT goes out on its own for the home screen's drop-down page, which
 * stops at the bar's top edge. It equals TAB_BAR_HEIGHT today, but the page
 * means "the bar's visible top", and that is the name that keeps meaning it
 * if the two ever part.
 */
export { TAB_ICON_SIZE, TAB_BAR_HEIGHT, BAR_HEIGHT };
