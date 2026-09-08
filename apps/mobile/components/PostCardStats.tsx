import { View, Text } from "react-native";
import useTheme from "@hooks/useTheme";
import { createHomeStyles } from "assets/styles/home.styles";

import { formatTime } from "@stdyapp/shared";

interface PostCardStatsProps {
  durationMinutes: number;
  goalsHit: number;
}

const PostCardStats = ({ durationMinutes, goalsHit }: PostCardStatsProps) => {
  const { colors } = useTheme();
  const homeStyles = createHomeStyles(colors);

  return (
    <View style={homeStyles.statsContainer}>
      <View>
        <Text style={homeStyles.stats}>Time</Text>
        <Text style={homeStyles.regular}>{formatTime(durationMinutes)}</Text>
      </View>
      <View>
        <Text style={homeStyles.stats}>Goals Hit</Text>
        <Text style={homeStyles.regular}>{`${goalsHit} goals`}</Text>
      </View>
    </View>
  );
};

export default PostCardStats;
