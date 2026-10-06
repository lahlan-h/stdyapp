import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

import { FAB_OVERHANG } from "./tabBar.styles";

/** The search box and the panel's buttons share one height and one corner. */
const CONTROL_HEIGHT = 44;
const CONTROL_RADIUS = 16;

/**
 * The filter and notification buttons' width. Fixed, so the two read as a pair
 * of equal squares-ish and the search box takes whatever the row has left.
 */
const PANEL_BUTTON_WIDTH = 56;

/**
 * How far the unread counter breaks past the notification button's corner.
 *
 * Android clips a child to its parent's bounds, so the counter cannot simply be
 * positioned outside the button - the tab bar's add-post circle hit the same
 * wall. Instead the button's wrapper is grown by this much up and to the right
 * with padding, pulled back into place with matching negative margins, and the
 * counter sits in that grown corner: inside its parent, drawn over the button.
 */
const BADGE_OVERHANG = 6;
const BADGE_SIZE = 20;
const NOTIFICATION_ICON_SIZE = 20;
const NOTIFICATION_CIRCLE_SIZE = 44;
const PANEL_PADDING_TOP = 8;
const PANEL_PADDING_BOTTOM = 12;

/**
 * The pinned panel's height BELOW the status bar.
 *
 * Fixed rather than measured, so the feed's top padding and the drop-down page's
 * top edge are right on the very first frame. Measuring with onLayout would
 * render one frame with the first card hidden under the panel and the page
 * opening from the wrong place, then jump.
 */
const HOME_PANEL_HEIGHT = PANEL_PADDING_TOP + CONTROL_HEIGHT + PANEL_PADDING_BOTTOM;

const HOME_SEARCH_ICON_SIZE = 20;
const SEARCH_ROW_ICON_SIZE = 18;
const SEARCH_AVATAR_SIZE = 44;
const SHEET_CLOSE_SIZE = 46;
const SHEET_CLOSE_ICON_SIZE = 24;
const FILTER_FIELD_ICON_SIZE = 16;

/** Rounded only where the page meets the feed - its top edge is under the panel. */
const SHEET_RADIUS = 26;

/**
 * Pinned to all four edges of the parent. Spelled out because this React
 * Native no longer ships StyleSheet.absoluteFillObject, and absoluteFill is a
 * registered style rather than an object that can be spread into another.
 */
const FILL = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

/** Same weight and tracking for every small-caps label on both pages. */
const smallCaps = (colors: ColorScheme) =>
  ({
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.textMuted,
  }) as const;

export const createHomeSearchStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // ---- Pinned panel -------------------------------------------------------
    panel: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      // paddingTop is the status-bar inset, supplied by the screen - these
      // sheets are built once per palette and cannot know it.
    },
    // The same two layers the tab bar uses, for the same reason: Android's blur
    // is weak, and without the translucent floor a busy feed smears through.
    panelSurface: {
      ...FILL,
      backgroundColor: colors.backgrounds.tabBar,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    panelRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: PANEL_PADDING_TOP,
      paddingBottom: PANEL_PADDING_BOTTOM,
    },
    // Whatever the two fixed-width buttons leave - the design's 80% split no
    // longer fits three objects, and the search box is the one that can give.
    searchBox: {
      flex: 1,
      minWidth: 0,
      height: CONTROL_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      borderRadius: CONTROL_RADIUS,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    searchBoxFocused: {
      borderColor: colors.primary,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      // Android pads TextInput vertically by default, which pushes the text off
      // centre in a fixed-height box.
      paddingVertical: 0,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.text,
    },
    filterButton: {
      width: PANEL_BUTTON_WIDTH,
      height: CONTROL_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: CONTROL_RADIUS,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      // Clips the tint layer below to the button's corners.
      overflow: "hidden",
    },
    filterButtonActive: {
      borderColor: colors.primary,
    },
    /**
     * The active wash, faded in by opacity rather than by animating a colour.
     *
     * The native driver can animate opacity but not backgroundColor, so the tint
     * is its own layer at full primary, shown at FILTER_TINT_OPACITY at most.
     */
    filterTint: {
      ...FILL,
      backgroundColor: colors.primary,
    },
    filterDot: {
      position: "absolute",
      top: 8,
      right: 10,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
      // A ring of the button's own fill, so the dot reads as sitting ON the
      // button rather than bleeding into the icon beside it.
      borderWidth: 2,
      borderColor: colors.backgrounds.input,
    },
    // See BADGE_OVERHANG: grown up and right by padding, pulled back by margin,
    // so the button lands exactly where a plain one would and the counter has
    // room inside its parent.
    notificationWrap: {
      marginTop: -BADGE_OVERHANG,
      marginRight: -BADGE_OVERHANG,
      paddingTop: BADGE_OVERHANG,
      paddingRight: BADGE_OVERHANG,
    },
    notificationBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      minWidth: BADGE_SIZE,
      height: BADGE_SIZE,
      paddingHorizontal: 5,
      borderRadius: BADGE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.notificationBadge,
      // A ring of the page colour, so the counter reads as sitting ON the
      // button's corner rather than as part of its border.
      borderWidth: 2,
      borderColor: colors.bg,
    },
    // White in both themes: notificationBadge is the same deep red in both.
    notificationBadgeLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 11,
      lineHeight: 13,
      color: "#ffffff",
      fontVariant: ["tabular-nums"],
    },

    // ---- Drop-down page -----------------------------------------------------
    // Spans panel-bottom to bar-top; the screen supplies both edges.
    sheetClip: {
      position: "absolute",
      left: 0,
      right: 0,
      overflow: "hidden",
    },
    scrim: {
      ...FILL,
      backgroundColor: colors.scrim,
    },
    sheet: {
      ...FILL,
      borderBottomLeftRadius: SHEET_RADIUS,
      borderBottomRightRadius: SHEET_RADIUS,
      borderBottomWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    sheetFill: {
      flex: 1,
    },
    sheetBody: {
      flex: 1,
    },
    sheetContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
    },
    /**
     * Bottom padding clears the add-post circle, which overhangs the bar by
     * FAB_OVERHANG and so sits over this page's lower edge, dead centre - exactly
     * where the close arrow is.
     */
    sheetFoot: {
      alignItems: "center",
      gap: 4,
      paddingTop: 6,
      paddingBottom: FAB_OVERHANG + 14,
    },
    closeButton: {
      width: SHEET_CLOSE_SIZE,
      height: SHEET_CLOSE_SIZE,
      borderRadius: SHEET_CLOSE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    closeHint: {
      ...smallCaps(colors),
      fontSize: 10,
    },

    // ---- Search page --------------------------------------------------------
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    sectionTitle: smallCaps(colors),
    linkLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.primary,
    },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    userMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    userAvatar: {
      width: SEARCH_AVATAR_SIZE,
      height: SEARCH_AVATAR_SIZE,
      borderRadius: SEARCH_AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    userText: {
      flex: 1,
      minWidth: 0,
    },
    userName: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    userHandle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    userMatch: {
      fontFamily: "PlusJakartaSans_700Bold",
      color: colors.primary,
    },
    removeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: {
      paddingVertical: 32,
      paddingHorizontal: 8,
      alignItems: "center",
      gap: 4,
    },
    emptyTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
      textAlign: "center",
    },
    emptyText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
    },

    // ---- Notifications page -------------------------------------------------
    // Rows reuse userRow and removeButton, so the page reads as a sibling of
    // recent searches; only what is different about a notification is here.
    notificationMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    // The type icon stands where a search row has an avatar: a notification
    // records what happened, not who did it, so there is no face to show.
    notificationIcon: {
      width: NOTIFICATION_CIRCLE_SIZE,
      height: NOTIFICATION_CIRCLE_SIZE,
      borderRadius: NOTIFICATION_CIRCLE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // primary at low strength behind the icon, by opacity for the same reason
    // filterTint uses it - there is no primary-tint token to reach for.
    notificationIconTint: {
      ...FILL,
      backgroundColor: colors.primary,
      opacity: 0.12,
    },
    notificationText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    notificationMessage: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 19,
      color: colors.text,
    },
    notificationMessageUnread: {
      fontFamily: "PlusJakartaSans_600SemiBold",
    },
    notificationMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    notificationUnreadDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.primary,
    },

    // ---- Filter page --------------------------------------------------------
    filterTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 20,
      letterSpacing: 0.8,
      color: colors.text,
      marginBottom: 4,
    },
    filterSection: {
      gap: 10,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    segmentGroup: {
      flexDirection: "row",
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: colors.border,
    },
    segment: {
      flex: 1,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "transparent",
    },
    segmentSelected: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    segmentLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    segmentLabelSelected: {
      color: colors.text,
    },
    fields: {
      flexDirection: "row",
      gap: 8,
    },
    field: {
      flex: 1,
      gap: 4,
    },
    fieldLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    fieldControl: {
      height: CONTROL_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    fieldControlInvalid: {
      borderColor: colors.danger,
    },
    fieldValue: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.text,
    },
    note: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    error: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.danger,
    },
    sortRows: {
      gap: 10,
    },
    sortRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sortLabel: {
      width: 86,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    chips: {
      flex: 1,
      flexDirection: "row",
      gap: 8,
    },
    chip: {
      flex: 1,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },
    // The page's own ground, not a fixed white: dark mode's primary is a pale
    // blue that white text all but disappears on.
    chipLabelSelected: {
      color: colors.bg,
    },
    filterNone: {
      paddingBottom: 12,
    },
    filterActions: {
      alignItems: "center",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    resetButton: {
      width: 160,
      height: CONTROL_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: CONTROL_RADIUS,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    resetButtonDisabled: {
      opacity: 0.4,
    },
    resetLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.danger,
    },
  });
  return styles;
};

export {
  HOME_PANEL_HEIGHT,
  HOME_SEARCH_ICON_SIZE,
  SEARCH_ROW_ICON_SIZE,
  SHEET_CLOSE_ICON_SIZE,
  FILTER_FIELD_ICON_SIZE,
  NOTIFICATION_ICON_SIZE,
};
