import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the author avatar on a post card. */
const AVATAR_SIZE = 65;

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
      alignItems: "baseline",
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
    postCardFooter: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
  });
  return styles;
};
