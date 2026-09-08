import { ColorScheme } from "@hooks/useTheme";
import { StyleSheet } from "react-native";

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
      width: 65,
      height: 65,
      borderRadius: 32.5,
    },
    bold: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    soft: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: "#cbd5e1",
    },
    stats: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: "#706C6C",
    },
    regular: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 18,
      color: "#cbd5e1",
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
