import { FlatList, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme, useHomeStyles } from "@theme";
import { usePosts, type FeedPost } from "@data";

import PostCard from "@components/PostCard";
import FeedSkeleton from "@components/FeedSkeleton"; // I think I might change to a spinner ...
import EmptyFeed from "@components/EmptyFeed";

const Index = () => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();
  const { posts, isLoading, canLoadMore, loadMore } = usePosts();

  return (
    <LinearGradient colors={colors.gradients.background} style={homeStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={homeStyles.safeArea} edges={["top", "left", "right"]}>
        {isLoading ? (
          <FeedSkeleton />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(post: FeedPost) => post.id}
            renderItem={({ item }: { item: FeedPost }) => <PostCard post={item} />}
            style={homeStyles.postCardList}
            contentContainerStyle={homeStyles.postCardListContent}
            ListEmptyComponent={EmptyFeed}
            showsVerticalScrollIndicator={false}
            onEndReached={canLoadMore ? loadMore : undefined}
            onEndReachedThreshold={0.5}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
