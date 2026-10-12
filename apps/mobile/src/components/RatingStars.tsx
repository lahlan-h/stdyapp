import { View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SESSION_HISTORY_STAR_SIZE } from "@theme";

const STARS = [1, 2, 3, 4, 5];

/**
 * The user's own 1-5 verdict on a session, read-only.
 *
 * Feather has no filled star, so given and not-given differ by colour - and
 * the accessibility label carries the number, so colour is never the only
 * channel.
 */
const RatingStars = ({ value, size = SESSION_HISTORY_STAR_SIZE }: { value: number; size?: number }) => {
  const { colors } = useTheme();
  const styles = useStyles("sessionHistory");

  return (
    <View style={styles.stars} accessible accessibilityLabel={`Rated ${value} out of 5`}>
      {STARS.map((n) => (
        <Feather
          key={n}
          name="star"
          size={size}
          color={n <= value ? colors.warning : colors.border}
        />
      ))}
    </View>
  );
};

export default RatingStars;
