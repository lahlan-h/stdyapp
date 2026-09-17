import { useCallback } from "react";
import { FlatList, StatusBar, View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { useTheme, useHomeStyles } from "@theme";
import { usePosts, consumeFeedStale, type FeedPost } from "@data";

import PostCard from "@components/PostCard";
import FeedSkeleton from "@components/FeedSkeleton";
import EmptyFeed from "@components/EmptyFeed";

const Index = () => {
  const { colors } = useTheme();
  const homeStyles = useHomeStyles();
  const { posts, isLoading, canLoadMore, loadMore, error, refresh } = usePosts();

  // Re-reads only when something actually wrote, rather than on every focus:
  // refreshing on each tab switch would discard every page past the first to
  // catch a change that usually has not happened.
  useFocusEffect(
    useCallback(() => {
      if (consumeFeedStale()) refresh();
    }, [refresh]),
  );

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
        ) : error && posts.length === 0 ? (
          // Only when there is nothing to show. An error while more pages load
          // must not blank a feed the user is already reading.
          <View style={homeStyles.emptyContainer}>
            <Text style={homeStyles.bold}>Can&apos;t load the feed</Text>
            <Text style={homeStyles.soft}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(post: FeedPost) => post.id}
            renderItem={({ item }: { item: FeedPost }) => <PostCard post={item} />}
            style={homeStyles.postCardList}
            contentContainerStyle={homeStyles.postCardListContent}
            ListEmptyComponent={EmptyFeed}
            showsVerticalScrollIndicator={false}
            onRefresh={refresh}
            refreshing={false}
            onEndReached={canLoadMore ? loadMore : undefined}
            onEndReachedThreshold={0.5}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
