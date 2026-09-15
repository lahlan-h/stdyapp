import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FlatList, StatusBar } from "react-native";

import { usePosts, type FeedPost } from "@data";
import { useTheme, useStyles } from "@theme";

import LoadingSpinner from "@components/LoadingSpinner";
import EmptyFeed from "@components/EmptyFeed";
import PostCard from "@components/PostCard";

const Index = () => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");
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
          <LoadingSpinner />
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
