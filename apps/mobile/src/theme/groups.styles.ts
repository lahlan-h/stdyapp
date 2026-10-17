import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

import { createRoutinesStyles } from "./routines.styles";

/** Header buttons and row icons, the same sizes as routines'. */
const GROUPS_HEADER_ICON_SIZE = 18;
const GROUPS_ICON_SIZE = 16;

const AVATAR_SIZE = 32;

/** 44pt minimum hit target, as in study.styles.ts. */
const TOUCH_MIN = 44;
/** The create page's close button - the size of the app's back buttons. */
const CLOSE_SIZE = 40;

/**
 * One box of the six a join code is typed into. Tall rather than square, so
 * a row of six fits a 360pt phone with room between them and the characters
 * still read at a glance across a desk.
 */
const CODE_BOX_WIDTH = 46;
const CODE_BOX_HEIGHT = 56;

/**
 * Groups list and group detail.
 *
 * BUILT ON the routines sheet rather than beside it: a group row and a routine
 * row sit under the same Study tab switch and should read as the same control.
 * Only what groups have and routines do not is added here - people, codes, and
 * full-width actions.
 */
export const createGroupsStyles = (colors: ColorScheme) => {
  const extra = StyleSheet.create({
    description: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
    },
    metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },

    // --- Full-width actions ---
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: TOUCH_MIN,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    // White in both themes: it sits on colors.primary, a mid blue either way.
    primaryButtonText: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: "#ffffff",
    },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: TOUCH_MIN,
      borderRadius: 14,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    dangerButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: TOUCH_MIN,
      borderRadius: 14,
      backgroundColor: colors.dangerTint,
      borderWidth: 1,
      borderColor: colors.dangerEdge,
    },
    dangerButtonText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.danger,
    },
    // A compact action at the end of a row: "Join" beside someone studying.
    rowButton: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    rowButtonText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: "#ffffff",
    },

    // --- Codes ---
    codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    // The code's own buttons - share it, or make a new one.
    codeActions: { flexDirection: "row", gap: 8 },

    // --- Typing a code: six boxes over one invisible input ---
    codeBoxes: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    codeBox: {
      width: CODE_BOX_WIDTH,
      height: CODE_BOX_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.backgrounds.input,
    },
    codeBoxFilled: {
      borderColor: colors.textMuted,
    },
    // The box the next character goes in, while the keyboard is up.
    codeBoxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryTint,
    },
    codeBoxInvalid: {
      borderColor: colors.danger,
    },
    codeBoxChar: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 24,
      color: colors.text,
    },
    // Covers the boxes so a tap anywhere on them focuses it; never seen.
    codeHiddenInput: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0,
      color: "transparent",
    },

    // --- Join or create, before a session starts ---
    joinCardCaption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    joinError: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.danger,
    },
    // "or" between the boxes and Create, rules either side.
    orRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    orRule: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    orText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },

    // --- The create-group page ---
    createPage: { flex: 1 },
    createContent: {
      gap: 14,
      paddingHorizontal: 20,
    },
    createHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 6,
    },
    // The analytics and settings back button's shape, with a cross: this page
    // is closed, not stepped back from.
    createClose: {
      width: CLOSE_SIZE,
      height: CLOSE_SIZE,
      borderRadius: CLOSE_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    createTitle: {
      flex: 1,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 28,
      color: colors.text,
    },
    createCaption: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
    },
    // A single-line input that is not in a row with a button, so it does not
    // take flex: 1 from the shared input style's row layout.
    createInput: {
      flex: 0,
    },
    codeText: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 22,
      letterSpacing: 3,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },

    // --- Edit card ---
    multilineInput: {
      minHeight: 88,
      paddingTop: 12,
      textAlignVertical: "top",
    },
    buttonRow: { flexDirection: "row", gap: 8 },
    flex: { flex: 1 },

    // The actions a member row opens into - the todo panel's chips, indented
    // to sit under the name rather than the avatar.
    memberPanel: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingLeft: AVATAR_SIZE + 12,
      paddingBottom: 8,
    },

    // --- Private toggle on the create card ---
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: TOUCH_MIN,
    },
    toggleLabel: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 15,
      color: colors.text,
    },

    // --- People: members, and who is studying now ---
    personRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: TOUCH_MIN,
      paddingVertical: 6,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: colors.bg,
    },
    personText: { flex: 1, gap: 2 },
    personName: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    personMeta: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    sectionLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginTop: 4,
    },
  });

  return { ...createRoutinesStyles(colors), ...extra };
};

export { GROUPS_HEADER_ICON_SIZE, GROUPS_ICON_SIZE };
