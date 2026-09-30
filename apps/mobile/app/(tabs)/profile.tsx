import { useCallback, useState } from "react";
import { FlatList, StatusBar, View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { useTheme, useStyles, useTabBarClearance } from "@theme";
import {
  useProfile,
  useUserPosts,
  useFollowCounts,
  useStreak,
  useStudySessions,
  useLikePost,
  type FeedPost,
} from "@data";

import PostCard from "@components/PostCard";
import LoadingSpinner from "@components/LoadingSpinner";
import ReportDialog from "@components/ReportDialog";
import ProfileHeader from "@components/ProfileHeader";
import ProfileActions from "@components/ProfileActions";
import ProfileStats from "@components/ProfileStats";
import ProfileStudyBubble from "@components/ProfileStudyBubble";

/**
 * The signed-in user's profile.
 *
 * Every hook here already takes a userId and defaults to the caller, so showing
 * SOMEONE ELSE's profile is a matter of threading one id through rather than a
 * second screen - except the study totals, which are self-only because
 * GET /api/sessions takes its target from the token. ProfileStudyCard drops
 * that column when it has none.
 */
const Profile = () => {
  const { colors } = useTheme();
  const styles = useStyles("profile");
  // What the floating tab bar covers, inset included - without it the last
  // card's buttons sit behind the bar, drawn but untappable.
  const tabBarClearance = useTabBarClearance();

  const { profile, isLoading: profileLoading, loadError, reload: reloadProfile } =
    useProfile();
  const { posts, isLoading: postsLoading, setLiked, reload: reloadPosts } =
    useUserPosts();
  const { summary } = useFollowCounts();
  const { streak } = useStreak();
  const { totals } = useStudySessions();

  // useUserPosts owns its array, so the optimistic update goes back to it -
  // the same contract usePosts has with this hook on the feed.
  const { toggleLike, error: likeError } = useLikePost(setLiked);

  // Held as an id, not the row: the row is looked up out of `posts` on every
  // render so the dialog sees the post as it currently is. A captured object
  // would go stale the moment the report landed.
  const [reportingId, setReportingId] = useState<string | null>(null);
  const reporting = posts.find((post) => post.id === reportingId) ?? null;

  /**
   * Re-reads on every focus, which the FEED deliberately does not do.
   *
   * Two reasons it is right here and wrong there. This list is unpaginated, so
   * a refresh throws nothing away - the feed would lose every page past the
   * first. And consumeFeedStale is a ONE-BIT flag that clears when read, so a
   * second screen consuming it would leave the feed thinking nothing had
   * changed; it belongs to the feed alone.
   */
  useFocusEffect(
    useCallback(() => {
      reloadPosts();
    }, [reloadPosts]),
  );

  if (profileLoading) {
    return (
      <LinearGradient colors={colors.gradients.background} style={styles.container}>
        <LoadingSpinner />
      </LinearGradient>
    );
  }

  if (!profile) {
    return (
      <LinearGradient colors={colors.gradients.background} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <View style={styles.centred}>
            <Text style={styles.message}>
              {loadError ?? "Could not load your profile."}
            </Text>
            <Pressable
              onPress={reloadProfile}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
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
          // Everything above the posts scrolls WITH them rather than sitting in
          // a ScrollView above a nested list, which would give the screen two
          // scroll views and break the inner one's virtualisation.
          ListHeaderComponent={
            <View style={styles.postList}>
              {/*
                The bubble is absolutely positioned against THIS wrapper, which
                is what keeps the avatar centred on the screen: a sibling in a
                row would push it off-centre by half the bubble's width.
                Rendered after the header so it draws on top of it.
              */}
              <View style={styles.headerArea}>
                <ProfileHeader profile={profile} />
                <ProfileStudyBubble streak={streak} totals={totals} />
              </View>
              <ProfileActions />
              <ProfileStats
                posts={posts.length}
                followers={summary?.followers}
                following={summary?.following}
              />
              {likeError ? (
                <Text style={styles.message}>{likeError}</Text>
              ) : null}
              <Text style={styles.sectionTitle}>Posts</Text>
            </View>
          }
          ListEmptyComponent={
            postsLoading ? null : (
              <Text style={styles.message}>No posts yet.</Text>
            )
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tabBarClearance },
          ]}
          showsVerticalScrollIndicator={false}
          onRefresh={reloadPosts}
          refreshing={false}
        />

        {/*
          ONE dialog for the whole list, outside the FlatList - inside a row it
          would be unmounted the moment that row scrolled out of the window.

          Closing re-reads the list. useReportPost writes to postStore, which
          no-ops for a post the FEED has not loaded, so this screen's own copy
          would otherwise keep an unfilled flag on a post that was just
          reported. See useUserPosts.
        */}
        <ReportDialog
          post={reporting}
          onClose={() => {
            setReportingId(null);
            reloadPosts();
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Profile;
