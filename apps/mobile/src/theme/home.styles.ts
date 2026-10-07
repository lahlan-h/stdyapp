import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the author avatar on a post card. */
const AVATAR_SIZE = 65;

/**
 * The add-post circle, now on the Feed rather than in the tab bar. A little
 * smaller than the 64 it was in the bar: it floats over posts now, and covers
 * whatever is under it.
 */
const FEED_FAB_SIZE = 58;
const FEED_FAB_ICON_SIZE = 28;
const FEED_FAB_RING = 4;

/** Gap between the circle and the screen edge, and between it and the bar. */
const FEED_FAB_MARGIN = 16;

/**
 * What the feed must leave clear under its last card so the circle never sits
 * on top of that card's like and comment buttons. Added to the tab bar
 * clearance at runtime.
 */
const FEED_FAB_CLEARANCE = FEED_FAB_SIZE + FEED_FAB_RING * 2 + FEED_FAB_MARGIN * 2;

export const createHomeStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    postCardList: {
      flex: 1,
    },
    postCardListContent: {
      paddingHorizontal: 4,
      paddingTop: 8,
      // No paddingBottom. The tab bar floats over the feed rather than sitting
      // below it, so the last card has to be scrollable clear of it by hand -
      // and how much that is depends on the safe-area inset, which no
      // stylesheet can know because these are built once at module load. The
      // screen supplies it from useTabBarClearance().
      gap: 10,
    },
    postCardBackground: {
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    postCardHeaderContainer: {
      flexDirection: "row",
      gap: 15,
      padding: 12,
      alignItems: "center",
    },
    postCardAvatar: {
      borderColor: colors.border,
      borderWidth: 1,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
    },
    bold: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    soft: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    stats: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: colors.textMuted,
    },
    regular: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: colors.text,
    },
    postCardBody: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 2,
      gap: 3,
      // NOT "baseline". Yoga only implements baseline alignment on row
      // containers; in a column it degrades and lays the children out at their
      // content width instead of stretching, which mismeasures where the title
      // and caption wrap.
      alignItems: "stretch",
    },
    statsContainer: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      flexDirection: "row",
      gap: 30,
    },
    postCardImage: {
      width: "100%",
      aspectRatio: 1 / 1,
      borderColor: colors.border,
      borderTopWidth: 1,
      borderBottomWidth: 1,
    },
    skeletonList: {
      paddingHorizontal: 4,
      paddingTop: 8,
      gap: 10,
    },
    skeletonCard: {
      height: 210,
      borderRadius: 26,
      borderWidth: 1,
      opacity: 0.55,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 6,
    },
    // The gap here separates the ACTION GROUPS. It is wider than the 8 inside
    // a group on purpose: at a uniform 8 the like count and the next icon sit
    // as close together as the icon and its own count, and the row reads as
    // five loose items rather than three actions.
    postCardFooter: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 22,
    },
    // One icon and its count, bound together.
    postCardAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    // --- Add-post circle ---
    // Positioned, not laid out: it floats over the list. `bottom` is set by
    // the screen, because it sits above the tab bar and that height includes
    // the runtime safe-area inset.
    fabWrap: {
      position: "absolute",
      right: FEED_FAB_MARGIN,
    },
    // Separation from the posts is a ring of surface plus a hairline, never a
    // shadow - nothing else in this app casts one. The tab bar circle's rule.
    fabRing: {
      padding: FEED_FAB_RING,
      borderRadius: (FEED_FAB_SIZE + FEED_FAB_RING * 2) / 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fab: {
      width: FEED_FAB_SIZE,
      height: FEED_FAB_SIZE,
      borderRadius: FEED_FAB_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
  });
  return styles;
};

export { FEED_FAB_ICON_SIZE, FEED_FAB_MARGIN, FEED_FAB_CLEARANCE };
