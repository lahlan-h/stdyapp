import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Size of a tab's icon. */
const TAB_ICON_SIZE = 25;

/** Diameter of the add-post circle. */
const FAB_SIZE = 64;

/** Width of the ring of bar colour that separates the circle from the bar. */
const FAB_RING = 5;

/** The plus glyph inside the circle. */
const FAB_ICON_SIZE = 30;

/** How far the circle breaks above the bar's top edge. */
const FAB_OVERHANG = 22;

/** The visible bar, not counting the safe-area inset below it. */
const BAR_HEIGHT = 56;

/**
 * What a screen has to leave clear at the bottom.
 *
 * The bar is absolutely positioned so the feed shows through behind the
 * circle's overhang, which means it no longer takes layout space and content
 * would otherwise scroll underneath it and stop there.
 */
const TAB_BAR_HEIGHT = FAB_OVERHANG + BAR_HEIGHT;

export const createTabBarStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    /**
     * Taller than the bar it draws, by exactly the circle's overhang.
     *
     * Android clips children that fall outside their parent's bounds, so the
     * circle must not actually overflow. Instead the container reserves the
     * overhang as padding and the surface below is inset from its top - the
     * circle then sits inside the container the whole time, and both platforms
     * draw it in full.
     */
    container: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: FAB_OVERHANG,
    },
    // The bar people actually see. Starts below the overhang zone, which stays
    // transparent so the feed runs behind the circle.
    surface: {
      position: "absolute",
      top: FAB_OVERHANG,
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
    // Five equal columns. The middle one is empty - the circle is not laid out
    // here, it only has to line up with the gap this leaves.
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
    /**
     * The circle is positioned, not laid out.
     *
     * In the row it would drive the row's height to its own 76px and inflate
     * the whole bar; pinned to the container's top instead, it overhangs by
     * exactly FAB_OVERHANG and the bar keeps the height it is told to have.
     */
    fabWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    // Separation from the bar is a ring of bar colour plus a hairline, never a
    // shadow: nothing else in this app casts one.
    fabRing: {
      padding: FAB_RING,
      borderRadius: (FAB_SIZE + FAB_RING * 2) / 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: FAB_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
  });
  return styles;
};

/** Re-exported so components can size their icons to match the stylesheet. */
export { TAB_ICON_SIZE, FAB_ICON_SIZE, TAB_BAR_HEIGHT };
