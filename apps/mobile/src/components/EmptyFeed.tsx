import { View, Text } from "react-native";

import { useStyles } from "@theme";

/** Shown when the feed has loaded and there is genuinely nothing in it. */
const EmptyFeed = () => {
  const homeStyles = useStyles("home");

  return (
    <View style={homeStyles.emptyContainer}>
      <Text style={homeStyles.bold}>No sessions yet</Text>
      <Text style={homeStyles.soft}>Log a study session and it will show up here.</Text>
    </View>
  );
};

export default EmptyFeed;
