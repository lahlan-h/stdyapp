import { View, Text } from "react-native";

import { useStyles } from "@theme";

interface ProfileStatsProps {
  posts: number;
  followers?: number;
  following?: number;
}

/**
 * An em dash while a figure is still loading, rather than a zero.
 *
 * Zero is a real answer here - plenty of accounts genuinely have no followers -
 * so showing it before the count arrives would state something false and then
 * silently correct itself.
 */
const show = (value?: number): string => (value === undefined ? "—" : String(value));

interface StatProps {
  value: string;
  label: string;
}

const Stat = ({ value, label }: StatProps) => {
  const styles = useStyles("profile");

  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

/** Posts, followers and following, as three plain figures under the header. */
const ProfileStats = ({ posts, followers, following }: ProfileStatsProps) => {
  const styles = useStyles("profile");

  return (
    <View style={styles.stats}>
      <Stat value={String(posts)} label="Posts" />
      <View style={styles.statDivider} />
      <Stat value={show(followers)} label="Followers" />
      <View style={styles.statDivider} />
      <Stat value={show(following)} label="Following" />
    </View>
  );
};

export default ProfileStats;
