import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** The eye toggle and the error icon - the app's 18pt glyph in a 40pt target. */
const LOGIN_ICON_SIZE = 18;

/** The tick inside the Remember me box, as in the report dialog's box. */
const LOGIN_CHECK_ICON_SIZE = 14;

/** Google's "G" on its button. */
const LOGIN_GOOGLE_MARK_SIZE = 20;

/** Diameter of the reveal button inside the password field. */
const REVEAL_SIZE = 40;

/** The Remember me box - the report dialog's reason box, same size and radius. */
const BOX_SIZE = 22;

export const createLoginStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },

    // --- Banner ---
    /**
     * Full-bleed and borderless, running up under the status bar - the top of
     * the screen, not a card resting on it. The screen supplies paddingTop
     * from the safe-area insets, which a stylesheet built at module load
     * cannot know.
     */
    banner: {
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 26,
      backgroundColor: colors.brandBanner,
    },
    // The asset is 400x150; aspectRatio keeps it from being stretched when the
    // width is capped.
    logo: {
      width: "100%",
      maxWidth: 260,
      aspectRatio: 400 / 150,
    },

    // --- Form ---
    /**
     * The banner scrolls WITH the form rather than sitting pinned above it: a
     * login screen is one keyboard away from half its height, and a pinned
     * 160pt banner would spend most of what is left.
     */
    scrollContent: {
      flexGrow: 1,
    },
    // new-post's shell: 16 of gutter, 22 between blocks. flexGrow lets the
    // sign-up line sit at the bottom on a tall screen and still scroll on a
    // short one.
    form: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: 26,
      gap: 22,
    },
    heading: {
      gap: 4,
    },
    headline: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
    },
    subline: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },

    // --- Google ---
    google: {
      height: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.google.edge,
      backgroundColor: colors.google.fill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    googleLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.google.text,
    },

    // --- OR divider ---
    // Two rules either side of the word rather than one rule with the label
    // painted over its middle: that needs the label's background to match what
    // is behind it, and what is behind it is a gradient.
    or: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    orRule: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    orLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      letterSpacing: 0.8,
      color: colors.textMuted,
    },

    // --- Fields ---
    field: {
      gap: 8,
    },
    /**
     * Binds the password field to the row under it at a tighter gap than the
     * 22 between blocks, so Remember me reads as belonging to the field. A
     * wrapper with its own gap rather than a negative margin on the row.
     */
    fieldGroup: {
      gap: 12,
    },
    label: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
      paddingHorizontal: 4,
    },
    // newPost's captionInput recipe at a single line's height.
    input: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
      color: colors.text,
    },
    inputWrap: {
      justifyContent: "center",
    },
    // Clears the reveal button so a long password never runs under it.
    passwordInput: {
      paddingRight: REVEAL_SIZE + 12,
    },
    reveal: {
      position: "absolute",
      right: 4,
      width: REVEAL_SIZE,
      height: REVEAL_SIZE,
      borderRadius: REVEAL_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },

    // --- Remember me / Forgot password? ---
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 2,
    },
    remember: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    /**
     * The report dialog's reason box: a soft-cornered SQUARE, deliberately not
     * a circle, because a circle reads as a radio. overflow hidden so the
     * checked gradient takes its corners.
     */
    box: {
      width: BOX_SIZE,
      height: BOX_SIZE,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    boxChecked: {
      borderColor: "transparent",
    },
    boxFill: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    link: {
      textDecorationLine: "underline",
    },
    // Hover, web only. Muted to full text colour and deliberately NOT to
    // primary: the links are inert placeholders, and colouring them like live
    // links would promise a destination neither has.
    linkHovered: {
      color: colors.text,
    },

    // --- Error ---
    // The compose screen's error box, verbatim.
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
    // Sizing and clipping only, for the reason newPost.styles gives: centring
    // on the Pressable collapses the gradient child to its label's width.
    submit: {
      height: 54,
      borderRadius: 14,
      overflow: "hidden",
    },
    submitFill: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    submitDisabled: {
      opacity: 0.45,
    },
    // Always #ffffff: this label sits on gradients.primary, the same blue in
    // both themes.
    submitLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: "#ffffff",
    },
    /**
     * Hover, web only - React Native has no hover of its own. A 1pt lift and
     * no shadow under it, because nothing in this app casts one; pitched below
     * the pressed state so rest, hover, pressed read as one sequence.
     */
    lifted: {
      transform: [{ translateY: -1 }],
    },

    // --- Dev bypass ---
    /**
     * The control shape, outlined in DASHES rather than filled. Dashed on
     * purpose: it should read as scaffolding, not as a second way in that
     * stands level with Log in - which is also why it is neutral rather than
     * primary.
     */
    devButton: {
      height: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    devLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 16,
      color: colors.text,
    },

    // --- Sign up ---
    // marginTop auto pins it to the bottom when the screen has room to spare.
    signup: {
      marginTop: "auto",
      paddingTop: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    signupLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
    },
  });
  return styles;
};

export { LOGIN_ICON_SIZE, LOGIN_CHECK_ICON_SIZE, LOGIN_GOOGLE_MARK_SIZE };
