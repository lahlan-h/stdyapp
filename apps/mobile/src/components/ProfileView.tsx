import { useState, type ReactNode } from "react";
import { FlatList, StatusBar, View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme, useStyles } from "@theme";
import {
  useLikePost,
  type FeedPost,
  type PublicProfile,
  type SetLiked,
  type Streak,
  type StudyTotals,
} from "@data";

import PostCard from "./PostCard";
import LoadingSpinner from "./LoadingSpinner";
import ReportDialog from "./ReportDialog";
import ProfileHeader from "./ProfileHeader";
import ProfileStats from "./ProfileStats";
import ProfileStudyBubble from "./ProfileStudyBubble";

interface ProfileViewProps {
  profile: PublicProfile;
  posts: FeedPost[];
  postsLoading: boolean;
  /** The posts hook's own setter - see SetLiked. */
  setLiked: SetLiked;
  reloadPosts: () => void;
  streak?: Streak;
  totals?: StudyTotals;
  /** False on someone else's profile - see ProfileStudyBubble. */
  showTotals?: boolean;
  followers?: number;
  following?: number;
  /** The buttons under the header: your own four, or follow and message for anyone else. */
  actions: ReactNode;
  /** The top bar's leading control - the back button, on a pushed profile. */
  topBarStart?: ReactNode;
  /** The top bar's last control, after the study pill - the gear, on your own. */
  topBarEnd?: ReactNode;
  /** The tab bar's clearance on the Profile tab, the home indicator's on a pushed screen. */
  bottomPadding: number;
}

/**
 * A profile, whoever's it is.
 *
 * Presentational: every hook that READS a profile lives in the screen that
 * renders this, because which hooks those are is exactly what differs - the
 * Profile tab reads /api/auth/me and the self-only session totals, while a
 * profile opened from search reads /api/users/:id and has no totals to read.
 * Calling one set or the other conditionally inside a single component is what
 * the rules of hooks forbid, so the choice is made one level up.
 *
 * What it does own is the list and everything wired to it - likes, the single
 * report dialog - since that is identical for both.
 */
const ProfileView = ({
  profile,
  posts,
  postsLoading,
  setLiked,
  reloadPosts,
  streak,
  totals,
  showTotals = true,
  followers,
  following,
  actions,
  topBarStart,
  topBarEnd,
  bottomPadding,
}: ProfileViewProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  // The posts hook owns its array, so the optimistic update goes back to it -
  // the same contract usePosts has with this hook on the feed.
  const { toggleLike, error: likeError } = useLikePost(setLiked);

  // Held as an id, not the row: the row is looked up out of `posts` on every
  // render so the dialog sees the post as it currently is. A captured object
  // would go stale the moment the report landed.
  const [reportingId, setReportingId] = useState<string | null>(null);
  const reporting = posts.find((post) => post.id === reportingId) ?? null;

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
              {/* The study pill rides in the bar, at its far end, ahead of
                  the gear on your own profile. */}
              <View style={styles.topBar}>
                {topBarStart}
                <View style={styles.topBarSpacer} />
                <ProfileStudyBubble
                  streak={streak}
                  totals={totals}
                  showTotals={showTotals}
                />
                {topBarEnd}
              </View>
              <ProfileHeader profile={profile} />
              {actions}
              <ProfileStats
                posts={posts.length}
                followers={followers}
                following={following}
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
            { paddingBottom: bottomPadding },
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

/** The spinner a profile shows before its first read lands. */
export const ProfileLoading = () => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <LoadingSpinner />
    </LinearGradient>
  );
};

interface ProfileMessageProps {
  message: string;
  onRetry?: () => void;
  /** The back control, so a failed pushed profile is never a dead end. */
  topBar?: ReactNode;
}

/** A profile that could not be shown, with a way to try again. */
export const ProfileMessage = ({ message, onRetry, topBar }: ProfileMessageProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {topBar ? <View style={styles.scrollContent}>{topBar}</View> : null}
        <View style={styles.centred}>
          <Text style={styles.message}>{message}</Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ProfileView;
