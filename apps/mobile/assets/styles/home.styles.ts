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
      flex: 1,
      height: 750,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
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
    username: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 17,
      color: colors.text,
    },
    timestamp: {
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 13,
      color: "#cbd5e1",
    },
  });
  return styles;
};
