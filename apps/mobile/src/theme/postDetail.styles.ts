import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the exit button nested in the card's top-right corner. */
const EXIT_SIZE = 40;

/** The cross inside it. */
const EXIT_ICON_SIZE = 18;

/** The post author's avatar. Larger than the feed's 65, smaller than a masthead. */
const AVATAR_SIZE = 68;

/** A commenter's avatar. */
const COMMENT_AVATAR_SIZE = 40;

/** Icons in the action row, matching the feed footer's weight. */
const ACTION_ICON_SIZE = 22;

export const createPostDetailStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },

    scrollContent: {
      paddingHorizontal: 4,
      paddingBottom: 40,
    },

    // --- Exit -------------------------------------------------------------
    /**
     * Nested in the card's corner but NOT a child of it.
     *
     * The card is overflow:hidden for its r26 corners, so anything inside it
     * that tried to stay put while the page scrolled would be clipped the
     * moment it moved. Absolutely positioned against the screen instead, which
     * also means it survives the scroll rather than leaving with the card.
     */
    exit: {
      position: "absolute",
      right: 18,
      width: EXIT_SIZE,
      height: EXIT_SIZE,
      borderRadius: EXIT_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
      zIndex: 3,
    },

    // --- The post ---------------------------------------------------------
    card: {
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    masthead: {
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 18,
      alignItems: "center",
    },
    title: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 26,
      lineHeight: 32,
      color: colors.text,
      textAlign: "center",
      // Clears the exit button sharing this corner. Both sides, so the title
      // stays optically centred rather than centred-then-nudged.
      paddingHorizontal: 34,
    },
    /** The short rule binding title and author into one block. */
    tie: {
      width: 28,
      height: 1,
      backgroundColor: colors.border,
      marginTop: 14,
      marginBottom: 16,
    },
    /**
     * Avatar left, name and age stacked right, the pair centred as one object.
     * The feed's header uses the same pairing run to the left edge; centring it
     * is what makes the detail view read as a page rather than a bigger card.
     */
    byline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    // Left-aligned against the masthead's centring: two short lines centred
    // beside a circle go ragged on both edges.
    bylineText: { alignItems: "flex-start" },
    name: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    age: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 3,
    },

    photo: {
      width: "100%",
      aspectRatio: 1,
      borderColor: colors.border,
      borderTopWidth: 1,
      borderBottomWidth: 1,
    },
    caption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    statsRow: {
      flexDirection: "row",
      gap: 30,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
    },
    statLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: colors.textMuted,
    },
    statValue: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: colors.text,
    },

    // --- Actions ----------------------------------------------------------
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 22,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 2,
    },
    action: { flexDirection: "row", alignItems: "center", gap: 8 },
    actionCount: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // --- The seam ---------------------------------------------------------
    /**
     * The one element that touches both screen edges.
     *
     * It works because the halves either side are structurally different: the
     * post is a card, the thread is open rows on the screen's own gradient.
     */
    seam: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: -4,
      marginTop: 22,
      marginBottom: 6,
    },

    // --- Discussion header ------------------------------------------------
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 13,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
    },
    countPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 1,
    },
    countText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.textMuted,
    },
    /**
     * r14, the CONTROL radius - deliberately not the r999 the count pill beside
     * it uses, so the two do not read as the same kind of object.
     */
    sort: {
      marginLeft: "auto",
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.backgrounds.input,
      overflow: "hidden",
    },
    sortKey: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    // The divider is a border on the value rather than its own element, so it
    // cannot fall out of sync with the chip's height.
    sortValue: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.text,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
    },

    // --- Thread -----------------------------------------------------------
    comment: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    commentAvatar: {
      width: COMMENT_AVATAR_SIZE,
      height: COMMENT_AVATAR_SIZE,
      borderRadius: COMMENT_AVATAR_SIZE / 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    commentBody: { flex: 1 },
    commentTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    /** A handle, not a name: the API has no first or last name on a commenter. */
    commentHandle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      color: colors.text,
    },
    commentAge: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    commentText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 19,
      color: colors.text,
      marginTop: 3,
    },
    threadEmpty: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      paddingHorizontal: 13,
      paddingVertical: 18,
      textAlign: "center",
    },

    // --- Composer ---------------------------------------------------------
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    composerInput: {
      flex: 1,
      maxHeight: 110,
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.text,
      textAlignVertical: "top",
    },
    // Sizing and clipping only - the centring lives on the gradient inside, or
    // the gradient collapses to the width of its glyph.
    send: {
      width: 44,
      height: 44,
      borderRadius: 14,
      overflow: "hidden",
    },
    sendFill: { flex: 1, alignItems: "center", justifyContent: "center" },
    sendDisabled: { opacity: 0.45 },

    // --- Error / empty ----------------------------------------------------
    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: 13,
      marginTop: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    errorText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.danger,
    },
    missing: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
      gap: 6,
    },
    missingTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    missingBody: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
    },
  });
  return styles;
};

export { EXIT_ICON_SIZE, ACTION_ICON_SIZE };
