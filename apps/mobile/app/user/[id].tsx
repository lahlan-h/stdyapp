import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, PROFILE_BACK_ICON_SIZE } from "@theme";
import {
  useUser,
  useUserPosts,
  useFollowCounts,
  useStreak,
  useFollow,
  toUserSummary,
} from "@data";

import ProfileView, { ProfileLoading, ProfileMessage } from "@components/ProfileView";
import FollowButton from "@components/FollowButton";
import MessageButton from "@components/MessageButton";

/** Breathing room under the last card, above the home indicator. Matches analytics. */
const BOTTOM_ROOM = 40;

/**
 * Someone else's profile, opened from the home screen's user search.
 *
 * The SAME screen as the Profile tab - ProfileView - fed by reads that take an
 * id instead of the token. Three things differ, all because this is not you:
 *   - no edit or sign-out, which act on the signed-in account; Follow and
 *     Message take their place, stacked the way your own two actions are;
 *   - no session totals, because GET /api/sessions is self-only by design and
 *     there is no by-user counterpart to ask;
 *   - a back control instead of a tab bar, since this is pushed over the tabs.
 */
const UserProfile = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { profile, isLoading, error, reload } = useUser(id);
  const { posts, isLoading: postsLoading, setLiked, reload: reloadPosts } =
    useUserPosts(id);
  const { summary, reload: reloadCounts } = useFollowCounts(id);
  const { streak } = useStreak(id);
  const follow = useFollow(id, summary, reloadCounts);
  const styles = useStyles("profile");

  const topBar = <BackBar />;

  if (isLoading && !profile) return <ProfileLoading />;

  if (!profile) {
    return (
      <ProfileMessage
        message={error ?? "Could not load this profile."}
        onRetry={reload}
        topBar={topBar}
      />
    );
  }

  return (
    <ProfileView
      profile={profile}
      posts={posts}
      postsLoading={postsLoading}
      setLiked={setLiked}
      reloadPosts={reloadPosts}
      streak={streak}
      showTotals={false}
      followers={summary?.followers}
      following={summary?.following}
      actions={
        <View style={styles.actions}>
          <FollowButton {...follow} />
          <MessageButton user={toUserSummary(profile)} />
        </View>
      }
      topBar={topBar}
      bottomPadding={BOTTOM_ROOM + insets.bottom}
    />
  );
};

/** The chevron analytics and edit-profile use, so every pushed screen goes back the same way. */
const BackBar = () => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <View style={styles.topBar}>
      <Pressable
        style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Feather name="chevron-left" size={PROFILE_BACK_ICON_SIZE} color={colors.text} />
      </Pressable>
    </View>
  );
};

export default UserProfile;
