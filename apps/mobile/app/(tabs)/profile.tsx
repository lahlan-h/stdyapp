import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

import { useTabBarClearance } from "@theme";
import {
  useProfile,
  useUserPosts,
  useFollowCounts,
  useStreak,
  useStudySessions,
} from "@data";

import ProfileView, { ProfileLoading, ProfileMessage } from "@components/ProfileView";
import ProfileActions from "@components/ProfileActions";

/**
 * The signed-in user's profile.
 *
 * The screen itself is ProfileView, shared with app/user/[id].tsx, which shows
 * anyone else opened from search. What is THIS screen's alone is its reads -
 * /api/auth/me and the session totals, both of which only ever answer for the
 * caller - and its actions, edit and sign out, which mean nothing on someone
 * else's profile.
 */
const Profile = () => {
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

  if (profileLoading) return <ProfileLoading />;

  if (!profile) {
    return (
      <ProfileMessage
        message={loadError ?? "Could not load your profile."}
        onRetry={reloadProfile}
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
      totals={totals}
      followers={summary?.followers}
      following={summary?.following}
      actions={<ProfileActions />}
      bottomPadding={tabBarClearance}
    />
  );
};

export default Profile;
