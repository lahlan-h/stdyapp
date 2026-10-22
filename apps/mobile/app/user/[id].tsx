import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
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
  useFollowRequest,
  toUserSummary,
  type PublicProfile,
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
 *
 * A PRIVATE account the viewer is not an approved follower of shows a lock in
 * place of its posts - the API refuses them anyway - and its Follow button asks
 * rather than follows. If this person has asked to follow the VIEWER, a card
 * above the actions offers Accept and Decline.
 */
const UserProfile = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { profile, isLoading, error, reload } = useUser(id);
  const { posts, isLoading: postsLoading, setLiked, reload: reloadPosts } =
    useUserPosts(id);
  const { summary, reload: reloadCounts } = useFollowCounts(id);
  const { streak, reload: reloadStreak } = useStreak(id);
  const follow = useFollow(id, summary, reloadCounts);
  const styles = useStyles("profile");

  // Locked only once the summary SAYS so: before it lands, the posts' own
  // loading state is what shows, not a lock that might be wrong.
  const locked = summary?.canView === false;

  // The posts and streak were refused while locked. When access arrives - a
  // request accepted, or the account going public - read them again rather
  // than leaving the lock's empty list on screen.
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      reloadPosts();
      reloadStreak();
    }
    wasLocked.current = locked;
  }, [locked, reloadPosts, reloadStreak]);

  // The bar ProfileView draws takes the bare button; the error screen, which
  // has no bar of its own, takes it wrapped in one.
  const back = <BackButton />;

  if (isLoading && !profile) return <ProfileLoading />;

  if (!profile) {
    return (
      <ProfileMessage
        message={error ?? "Could not load this profile."}
        onRetry={reload}
        topBar={<View style={styles.topBar}>{back}</View>}
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
      locked={locked}
      actions={
        <>
          {summary?.requestsMe ? (
            <FollowRequestCard profile={profile} onAnswered={reloadCounts} />
          ) : null}
          <View style={styles.actions}>
            <FollowButton {...follow} />
            <MessageButton user={toUserSummary(profile)} />
          </View>
        </>
      }
      topBarStart={back}
      bottomPadding={BOTTOM_ROOM + insets.bottom}
    />
  );
};

/**
 * "{name} wants to follow you", with Accept and Decline - the other way to
 * answer a request, beside the notification it raised.
 *
 * The same two-to-a-row pills as the actions beneath it. `onAnswered` re-reads
 * the follow summary, which is what takes this card away and moves the
 * follower count.
 */
const FollowRequestCard = ({
  profile,
  onAnswered,
}: {
  profile: PublicProfile;
  onAnswered: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");
  const { accept, decline, isBusy, error } = useFollowRequest();
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.username;

  const answer = async (yes: boolean) => {
    await (yes ? accept(profile.id) : decline(profile.id));
    // Re-read whatever happened. A failure that was a 404 means the request was
    // answered elsewhere, and the summary is what says so; any other failure
    // re-reads the same summary and leaves the card - and its error - up.
    onAnswered();
  };

  return (
    <View style={styles.requestCard}>
      <Text style={styles.requestText}>{name} wants to follow you.</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => answer(true)}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${name}'s follow request`}
          accessibilityState={{ disabled: isBusy, busy: isBusy }}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionButtonPrimary,
            (pressed || isBusy) && { opacity: 0.6 },
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={[styles.actionLabel, styles.actionLabelOnPrimary]}>Accept</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => answer(false)}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel={`Decline ${name}'s follow request`}
          accessibilityState={{ disabled: isBusy }}
          style={({ pressed }) => [styles.actionButton, (pressed || isBusy) && { opacity: 0.6 }]}
        >
          <Text style={styles.actionLabel}>Decline</Text>
        </Pressable>
        {error ? <Text style={styles.actionError}>{error}</Text> : null}
      </View>
    </View>
  );
};

/** The chevron analytics and edit-profile use, so every pushed screen goes back the same way. */
const BackButton = () => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <Pressable
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Feather name="chevron-left" size={PROFILE_BACK_ICON_SIZE} color={colors.text} />
    </Pressable>
  );
};

export default UserProfile;
