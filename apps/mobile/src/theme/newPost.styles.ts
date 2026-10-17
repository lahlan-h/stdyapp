import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** The glyph in the Discard button. */
const EXIT_ICON_SIZE = 16;

/** One of the five focus-rating circles - a full thumb's width. */
const RATING_SIZE = 50;

/** Leading icon on a link row, and the box reserved for it. */
const ROW_ICON_SIZE = 20;
const ROW_ICON_BOX = 28;
/** One thumbnail on the compose screen. The strip wraps, so a narrow phone shows two rows. */
const PHOTO_THUMB_SIZE = 96;

export const createNewPostStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 22,
    },

    /**
     * The bar above the form: Discard on the left, the screen's name across
     * from it. Outside the scroller, so leaving is always one tap away - the
     * screen is long enough to scroll, and a discard control that scrolls off
     * the top strands anyone who changes their mind halfway down.
     *
     * A labelled pill, not the round X it was: that sat tucked into the top
     * corner, small enough to miss and close enough to the edge to mis-tap.
     */
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
    },
    headerTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.textMuted,
    },
    exit: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    exitLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      color: colors.danger,
    },

    // The post's text, edited in place as the screen's headline rather than
    // sitting in a labelled box below it.
    titleInput: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 28,
      color: colors.text,
      paddingTop: 4,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    fieldHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingHorizontal: 4,
    },
    fieldLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    fieldLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    captionInput: {
      minHeight: 96,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      color: colors.text,
      textAlignVertical: "top",
    },
    counter: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingTop: 2,
    },

    // --- The finished session's numbers, under the title ---
    // Duration and focus side by side, as Hevy lays out a workout's numbers.
    sessionStats: {
      flexDirection: "row",
      gap: 28,
      paddingHorizontal: 6,
    },
    sessionStat: {
      gap: 2,
    },
    sessionStatLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    // Primary, as Hevy colours its duration: the one number here that is
    // the app's to state rather than the user's to fill in.
    sessionStatValue: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 20,
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },

    // --- Section ---
    section: {
      gap: 8,
    },
    sectionHint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    sectionHintDanger: { color: colors.danger },

    // --- Focus rating: five circles, changeable until Post ---
    ratingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    ratingButton: {
      width: RATING_SIZE,
      height: RATING_SIZE,
      borderRadius: RATING_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    ratingButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    ratingText: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.text,
    },
    // The page's ground rather than a fixed white, for actionLabelOnPrimary's
    // reason in profile.styles: dark mode's primary is a pale blue.
    ratingTextSelected: { color: colors.bg },
    ratingScale: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
      paddingHorizontal: 4,
    },
    sectionCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    // --- Photos ---
    // The empty state: one big square to tap, until the first photo is picked.
    photoWell: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.editInput,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      gap: 10,
    },
    photoPrompt: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.textMuted,
    },
    photoHint: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    // Once there are photos: a row of square thumbnails in posting order, and
    // an Add tile while there is room for more.
    photoStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    thumb: {
      width: PHOTO_THUMB_SIZE,
      height: PHOTO_THUMB_SIZE,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
    },
    thumbImage: {
      width: "100%",
      height: "100%",
    },
    // Sits on an arbitrary image, so it carries its own surface rather than
    // relying on contrast with whatever is underneath.
    thumbRemove: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addTile: {
      width: PHOTO_THUMB_SIZE,
      height: PHOTO_THUMB_SIZE,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.editInput,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    addTileLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.textMuted,
    },

    // --- Link rows ---
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      minHeight: 58,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowIconBox: {
      width: ROW_ICON_BOX,
      alignItems: "flex-start",
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },
    rowValue: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    footnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      color: colors.textMuted,
      paddingHorizontal: 6,
      paddingTop: 2,
    },

    // A link row's clear button: its own padded target inside the row's.
    rowClear: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },

    // --- Link picker sheet ---
    pickerBackdrop: { flex: 1, backgroundColor: colors.scrim },
    pickerSheet: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: "70%",
      paddingTop: 18,
      paddingHorizontal: 16,
      gap: 10,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 4,
    },
    pickerTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 18,
      color: colors.text,
    },
    pickerOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
    },
    pickerOptionSelected: { backgroundColor: colors.bg },
    pickerState: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },

    // --- Error ---
    error: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
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

    // --- Submit ---
    // Pinned, for the same reason as the discard button: the primary action of
    // a screen should not require scrolling to find.
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    // Sizing and clipping only. Centring deliberately does NOT live here: this
    // style is on the Pressable, and alignItems:center on it made the gradient
    // child - the only element that paints anything - collapse to the width of
    // the word "Post" instead of filling the footer.
    submit: {
      height: 54,
      borderRadius: 14,
      overflow: "hidden",
    },
    // The gradient. flex:1 fills the Pressable it sits in, so the button spans
    // the footer edge to edge.
    submitFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    submitDisabled: {
      opacity: 0.45,
    },
    // Always the light palette's surface, never colors.text: this label sits on
    // gradients.primary, the same mid blue in both themes, so flipping it with
    // the theme would put dark text on a dark-enough blue in light mode.
    submitLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
    },
  });
  return styles;
};

export { EXIT_ICON_SIZE, ROW_ICON_SIZE };
