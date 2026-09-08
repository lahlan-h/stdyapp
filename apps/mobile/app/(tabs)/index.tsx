import useTheme from "@hooks/useTheme";
import { FlatList, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createHomeStyles } from "assets/styles/home.styles";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "components/Header";

// TODOs -
//  (1) - Loading spinner if waiting for incoming data - or skeleton page
//  (2) - Page if no posts we're retrieved

const Index = () => {
  const { colors, isDarkMode } = useTheme();
  const homeStyles = createHomeStyles(colors);

  return (
    <LinearGradient colors={colors.gradients.background} style={homeStyles.container}>
      <StatusBar barStyle={colors.statusBarStyle}></StatusBar>
      {/* Home Page Content Here*/}
      <SafeAreaView style={homeStyles.safeArea} edges={["top", "left", "right"]}>
        <Header /> {/* Enable Switching Between 'Feeds'*/}
        {/*  */}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
