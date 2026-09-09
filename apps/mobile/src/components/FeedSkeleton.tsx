import { View } from "react-native";

import { useTheme, useHomeStyles } from "@theme";

/**
 * Placeholder cards for the first page.
 *
 * The feed used to render nothing at all while loading, and each card returned
 * null until its author resolved, so posts appeared one at a time against a
 * blank screen.
 */
const FeedSkeleton = ({ count = 3 }: { count?: number }) => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.skeletonList}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            homeStyles.skeletonCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
      ))}
    </View>
  );
};

export default FeedSkeleton;
