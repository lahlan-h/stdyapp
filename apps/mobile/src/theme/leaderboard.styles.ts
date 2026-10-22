import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the back button, and its glyph - edit-profile's values. */
const BACK_SIZE = 40;
const LEADERBOARD_BACK_ICON_SIZE = 18;

/** Avatars in list rows. */
const LEADERBOARD_AVATAR_SIZE = 40;

/** Podium avatars: the winner's is larger, so first place reads at a glance. */
const LEADERBOARD_PODIUM_AVATAR = 56;
const LEADERBOARD_PODIUM_AVATAR_FIRST = 72;

/** Icons in notices, tabs and the empty state. */
const LEADERBOARD_ICON_SIZE = 16;
const LEADERBOARD_EMPTY_ICON_SIZE = 28;

/** Width the rank column reserves, so names line up from 4th to 99th. */
const RANK_WIDTH = 28;

/**
 * Medal colours. THE SAME IN BOTH THEMES, like gradients.primary: gold, silver
 * and bronze are meanings, not theme colours, and a "dark mode gold" would stop
 * reading as gold.
 */
const MEDALS = {
  1: "#F5C451",
  2: "#C3CBD8",
  3: "#D9905A",
} as const;

/** Podium pedestal heights by place: a clear step down, not a staircase. */
const PEDESTAL_HEIGHT = { 1: 92, 2: 68, 3: 52 } as const;

/**
 * Leaderboard: who is ahead, by how much, and where you stand.
 *
 * Built in three tiers of emphasis - your standing (the one thing you came to
 * check), the podium (the race), then everyone else - so the eye lands in that
 * order. Surfaces, radii and type follow analytics and edit-profile, so the
 * screen reads as part of the same app.
 */
export const createLeaderboardStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 10,
    },
    listHeader: { gap: 16, marginBottom: 6 },

    // --- Header ---
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
    },
    back: {
      width: BACK_SIZE,
      height: BACK_SIZE,
      borderRadius: BACK_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    titleColumn: { gap: 2, marginTop: -4 },
    screenTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 32,
      color: colors.text,
    },
    screenSubtitle: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },

    // --- Range pill (in the header) ---
    rangePill: {
      flexDirection: "row",
      padding: 3,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rangeOption: {
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    rangeOptionSelected: { backgroundColor: colors.border },
    rangeLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 12,
      color: colors.textMuted,
    },
    rangeLabelSelected: { color: colors.text },

    // --- Metric tabs ---
    segmentGroup: {
      flexDirection: "row",
      gap: 6,
      padding: 4,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    segmentSelected: { backgroundColor: colors.primary },
    segmentLabel: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.textMuted,
    },
    // White in both themes: it sits on colors.primary, a mid blue either way.
    segmentLabelSelected: { color: "#ffffff" },

    // --- Your standing ---
    standing: {
      borderRadius: 22,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    standingTop: { flexDirection: "row", alignItems: "center", gap: 14 },
    standingRank: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 44,
      lineHeight: 48,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    standingOf: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: colors.textMuted,
    },
    standingDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: colors.border,
    },
    standingValueColumn: { flex: 1, alignItems: "flex-end" },
    standingValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 26,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    standingUnit: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    standingGap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    standingGapText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },

    // --- Podium ---
    // The podium stands on the bottom edge of its own card, so the pedestals
    // read as standing on a floor rather than stopping in mid-air.
    podium: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingTop: 18,
      paddingHorizontal: 12,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    podiumSlot: { flex: 1, alignItems: "center", gap: 8 },
    podiumPerson: { alignItems: "center", gap: 4, paddingHorizontal: 2 },
    podiumCrown: { marginBottom: -2 },
    podiumAvatarRing: {
      borderRadius: 999,
      borderWidth: 3,
      padding: 2,
    },
    podiumAvatar: {
      width: LEADERBOARD_PODIUM_AVATAR,
      height: LEADERBOARD_PODIUM_AVATAR,
      borderRadius: LEADERBOARD_PODIUM_AVATAR / 2,
      backgroundColor: colors.border,
    },
    podiumAvatarFirst: {
      width: LEADERBOARD_PODIUM_AVATAR_FIRST,
      height: LEADERBOARD_PODIUM_AVATAR_FIRST,
      borderRadius: LEADERBOARD_PODIUM_AVATAR_FIRST / 2,
    },
    podiumName: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 13,
      color: colors.text,
      textAlign: "center",
    },
    podiumValue: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    pedestal: {
      alignSelf: "stretch",
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      alignItems: "center",
      paddingTop: 10,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      overflow: "hidden",
    },
    pedestalRank: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 22,
      fontVariant: ["tabular-nums"],
    },
    // The empty third place: an open seat, not a missing one.
    openSeat: {
      width: LEADERBOARD_PODIUM_AVATAR,
      height: LEADERBOARD_PODIUM_AVATAR,
      borderRadius: LEADERBOARD_PODIUM_AVATAR / 2,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    openSeatText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
    },
    youTag: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 10,
      color: colors.primary,
      letterSpacing: 0.6,
    },

    // --- Rows (4th and below) ---
    sectionLabel: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 12,
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginTop: 6,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    rowMine: { borderColor: colors.primary, borderWidth: 2 },
    pressed: { opacity: 0.7 },
    rank: {
      width: RANK_WIDTH,
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    avatar: {
      width: LEADERBOARD_AVATAR_SIZE,
      height: LEADERBOARD_AVATAR_SIZE,
      borderRadius: LEADERBOARD_AVATAR_SIZE / 2,
      backgroundColor: colors.border,
    },
    nameColumn: { flex: 1, minWidth: 0, gap: 6 },
    name: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.text,
    },
    detail: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },
    // How each person compares with the leader, in one thin line.
    rowBarTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" },
    rowBarFill: { height: "100%", borderRadius: 2, backgroundColor: colors.textMuted },
    valueColumn: { alignItems: "flex-end" },
    value: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    valueUnit: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 11,
      color: colors.textMuted,
    },

    // --- Invite nudge ---
    invite: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 56,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
    },
    inviteText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    inviteStrong: { fontFamily: "PlusJakartaSans_600SemiBold", color: colors.text },

    // --- Teaser card (the way in, on Analytics) ---
    teaser: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minHeight: 64,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    teaserBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(245,196,81,0.16)",
    },
    teaserText: { flex: 1, minWidth: 0, gap: 2 },
    teaserTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 15,
      color: colors.text,
    },
    teaserDetail: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      color: colors.textMuted,
    },

    // --- Sticky "You" row ---
    stickyWrap: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.bg,
    },

    // --- States ---
    footnote: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
    },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noticeText: {
      flex: 1,
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    empty: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 40,
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontFamily: "PlusJakartaSans_700Bold",
      fontSize: 17,
      color: colors.text,
      textAlign: "center",
    },
    emptyText: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: "center",
    },
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
  });
  return styles;
};

export {
  LEADERBOARD_BACK_ICON_SIZE,
  LEADERBOARD_AVATAR_SIZE,
  LEADERBOARD_ICON_SIZE,
  LEADERBOARD_EMPTY_ICON_SIZE,
  LEADERBOARD_PODIUM_AVATAR,
  MEDALS as LEADERBOARD_MEDALS,
  PEDESTAL_HEIGHT as LEADERBOARD_PEDESTAL_HEIGHT,
};
