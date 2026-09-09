import { View, Text } from "react-native";

import { useHomeStyles } from "@theme";
import { formatDuration } from "@stdyapp/shared";

interface PostCardStatsProps {
  durationMinutes: number;
  goalsHit: number;
}

const PostCardStats = ({ durationMinutes, goalsHit }: PostCardStatsProps) => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.statsContainer}>
      <View>
        <Text style={homeStyles.stats}>Time</Text>
        <Text style={homeStyles.regular}>{formatDuration(durationMinutes)}</Text>
      </View>
      <View>
        <Text style={homeStyles.stats}>Goals Hit</Text>
        <Text style={homeStyles.regular}>
          {goalsHit === 1 ? "1 goal" : `${goalsHit} goals`}
        </Text>
      </View>
    </View>
  );
};

export default PostCardStats;
