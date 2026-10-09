import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** The chat header's back button and avatar - a notch smaller than a list row's. */
const CHAT_HEADER_CONTROL = 36;
const CHAT_BACK_ICON_SIZE = 20;

/** The send button: a circle the height of a one-line message box. */
const SEND_SIZE = 40;
const SEND_ICON_SIZE = 18;

/** Bubbles round off everywhere except the corner nearest the sender - the "tail". */
const BUBBLE_RADIUS = 18;
const BUBBLE_TAIL_RADIUS = 6;

/** About four lines of text before the message box scrolls instead of growing. */
const COMPOSER_MAX_HEIGHT = 104;

/** Pinned to all four edges - see the note on FILL in homeSearch.styles. */
const FILL = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

export const createMessagesStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    // ---- The page: the list, with a chat sliding over it --------------------
    page: {
      flex: 1,
      overflow: "hidden",
    },
    layer: {
      ...FILL,
    },
    // The chat is opaque so it covers the list it slides over. The page's own
    // ground rather than the sheet's gradient: the layer starts below the
    // sheet's top, so a gradient here would restart and show a seam.
    chatLayer: {
      backgroundColor: colors.bg,
    },

    // ---- Conversation list rows (around homeSearch's userRow) --------------
    convText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    convLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    convName: {
      flex: 1,
      minWidth: 0,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    convNameUnread: {
      fontFamily: "PlusJakartaSans_700Bold",
    },
    convTime: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    convTimeUnread: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.primary,
    },
    convPreview: {
      flex: 1,
      minWidth: 0,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    convPreviewUnread: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.text,
    },
    // How many messages from this person are unread. Solid primary with the
    // page's ground for text, the chip convention - white all but vanishes on
    // dark mode's pale blue.
    pill: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    pillLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 11,
      color: colors.bg,
      fontVariant: ["tabular-nums"],
    },

    // ---- Chat header --------------------------------------------------------
    chat: {
      flex: 1,
    },
    chatHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: CHAT_HEADER_CONTROL,
      height: CHAT_HEADER_CONTROL,
      borderRadius: CHAT_HEADER_CONTROL / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chatAvatar: {
      width: CHAT_HEADER_CONTROL,
      height: CHAT_HEADER_CONTROL,
      borderRadius: CHAT_HEADER_CONTROL / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chatWho: {
      flex: 1,
      minWidth: 0,
    },
    chatName: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.text,
    },
    chatHandle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // ---- History ------------------------------------------------------------
    log: {
      flex: 1,
    },
    logContent: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    // One message and what hangs off it - its day separator above, its time
    // below. The vertical padding is the gap between consecutive bubbles.
    row: {
      paddingVertical: 1.5,
    },
    daySeparator: {
      alignSelf: "center",
      paddingTop: 12,
      paddingBottom: 6,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 11,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    // Side and width live on the WRAPPER the entrance animation drives, so a
    // bubble scales from its own centre rather than the row's, and 78% is of
    // the row rather than of a box already 78% wide.
    bubbleWrapMine: {
      alignSelf: "flex-end",
      maxWidth: "78%",
    },
    bubbleWrapTheirs: {
      alignSelf: "flex-start",
      maxWidth: "78%",
    },
    bubble: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BUBBLE_RADIUS,
    },
    bubbleMine: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: BUBBLE_TAIL_RADIUS,
    },
    bubbleTheirs: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: BUBBLE_TAIL_RADIUS,
    },
    // Still on its way: present, but not yet a fact.
    bubbleSending: {
      opacity: 0.6,
    },
    bubbleFailed: {
      opacity: 0.6,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    bubbleText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    bubbleTextMine: {
      color: colors.bg,
    },
    bubbleTime: {
      paddingHorizontal: 6,
      paddingTop: 2,
      paddingBottom: 8,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 11,
      color: colors.textMuted,
      fontVariant: ["tabular-nums"],
    },
    bubbleTimeMine: {
      alignSelf: "flex-end",
    },
    bubbleTimeTheirs: {
      alignSelf: "flex-start",
    },
    bubbleTimeFailed: {
      alignSelf: "flex-end",
      fontFamily: "PlusJakartaSans_600SemiBold",
      color: colors.danger,
    },
    olderSpinner: {
      paddingVertical: 12,
    },
    chatEmpty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 4,
    },
    chatEmptyTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
      textAlign: "center",
    },
    chatEmptyText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
    },
    chatError: {
      paddingHorizontal: 16,
      paddingTop: 6,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.danger,
      textAlign: "center",
    },

    // ---- Message box --------------------------------------------------------
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },
    composerInput: {
      flex: 1,
      minHeight: SEND_SIZE,
      maxHeight: COMPOSER_MAX_HEIGHT,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      borderRadius: SEND_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      color: colors.text,
    },
    composerInputFocused: {
      borderColor: colors.primary,
    },
    send: {
      width: SEND_SIZE,
      height: SEND_SIZE,
      borderRadius: SEND_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
  });
  return styles;
};

export { CHAT_BACK_ICON_SIZE, SEND_ICON_SIZE };
