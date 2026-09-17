import { View, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@theme";

const LoadingSpinner = () => {
  const { colors } = useTheme();

  return (
    <LinearGradient colors={colors.gradients.background} style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </LinearGradient>
  );
};

export default LoadingSpinner;
