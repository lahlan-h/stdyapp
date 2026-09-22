import { useCallback, useState } from "react";
import { FlatList, StatusBar, View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { useTheme, useStyles, useTabBarClearance } from "@theme";
import { usePosts, useLikePost, consumeFeedStale, type FeedPost } from "@data";

import PostCard from "@components/PostCard";
import LoadingSpinner from "@components/LoadingSpinner";
import EmptyFeed from "@components/EmptyFeed";
import ReportDialog from "@components/ReportDialog";

const Index = () => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");
  // What the floating tab bar covers, inset included. Without it the last
  // card's like, comment and report buttons sit behind the bar, drawn but
  // untappable, with nothing on screen explaining why.
  const tabBarClearance = useTabBarClearance();
  const { posts, isLoading, canLoadMore, loadMore, error, refresh, setLiked } =
    usePosts();
  // usePosts owns the array, so the optimistic update is handed back to it
  // rather than kept a second time over there - see SetLiked.
  const { toggleLike, error: likeError } = useLikePost(setLiked);

  /**
   * Which post the report dialog is open for, held as an ID rather than the row.
   *
   * The row is then looked up out of `posts` on every render, so the dialog sees
   * the post as the store currently holds it. A captured object would go stale
   * the moment the report landed, and the dialog would offer to file a report it
   * had just filed.
   */
  const [reportingId, setReportingId] = useState<string | null>(null);
  const reporting = posts.find((post) => post.id === reportingId) ?? null;

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
          <LoadingSpinner />
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
            renderItem={({ item }: { item: FeedPost }) => (
              <PostCard
                post={item}
                onToggleLike={() => toggleLike(item)}
                onReport={() => setReportingId(item.id)}
              />
            )}
            style={homeStyles.postCardList}
            contentContainerStyle={[
              homeStyles.postCardListContent,
              { paddingBottom: tabBarClearance },
            ]}
            // A rolled-back like says so above the feed rather than in an
            // alert: the heart has already snapped back, so this only explains
            // a change the user can already see undone.
            ListHeaderComponent={
              likeError ? (
                <Text style={homeStyles.soft}>{likeError}</Text>
              ) : null
            }
            ListEmptyComponent={EmptyFeed}
            showsVerticalScrollIndicator={false}
            onRefresh={refresh}
            refreshing={false}
            onEndReached={canLoadMore ? loadMore : undefined}
            onEndReachedThreshold={0.5}
          />
        )}

        {/* ONE dialog for the whole list, outside the FlatList. Inside a row it
            would be unmounted the moment that row scrolled out of the window. */}
        <ReportDialog post={reporting} onClose={() => setReportingId(null)} />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
