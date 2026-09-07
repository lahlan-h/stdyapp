import useTheme from "@hooks/useTheme";
import { Text, View } from "react-native";

const Index = () => {
  const { colors } = useTheme();

  return (
    <View>
      <Text>Index</Text>
    </View>
  );
};

export default Index;
