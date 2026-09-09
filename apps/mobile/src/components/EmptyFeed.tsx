import { View, Text } from "react-native";

import { useHomeStyles } from "@theme";

/** Shown when the feed has loaded and there is genuinely nothing in it. */
const EmptyFeed = () => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.emptyContainer}>
      <Text style={homeStyles.bold}>No sessions yet</Text>
      <Text style={homeStyles.soft}>
        Log a study session and it will show up here.
      </Text>
    </View>
  );
};

export default EmptyFeed;
