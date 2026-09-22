import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  useTheme,
  usePostDetailStyles,
  POST_DETAIL_EXIT_ICON_SIZE,
  ACTION_ICON_SIZE,
} from "@theme";
import {
  usePost,
  useComments,
  useLikePost,
  MAX_COMMENT_LENGTH,
  setPostLiked,
  type Comment,
  type FeedPost,
} from "@data";
import { formatRelativeTime, formatDuration } from "@stdyapp/shared";

import ReportDialog from "@components/ReportDialog";

/** Stands in for a number that is not known yet, rather than inventing one. */
const PLACEHOLDER = "—";

/**
 * How far the composer has to rise to clear the keyboard.
 *
 * Measured rather than assumed, and that is the whole point. The obvious
 * version - lift by the keyboard's height - is wrong on any platform whose
 * window already shrinks for the keyboard, because the composer has moved
 * before this runs and lifting it again sends it into the middle of the
 * screen. Whether that shrinking happens depends on the Android keyboard mode
 * and on whether the app draws edge to edge, which is not something a screen
 * should have to know.
 *
 * So it asks the only question that has one answer everywhere: where is the
 * composer's bottom edge right now, and where does the keyboard start? The
 * difference is the overlap. A window that already resized reports no overlap
 * and nothing moves.
 *
 * The events differ deliberately: iOS fires `Will` before the frame animates,
 * so the lift rides the same animation instead of snapping in after it, while
 * Android only ever fires `did` - by which point any resize has happened,
 * which is exactly what makes the measurement come out at zero there.
 */
/**
 * Breathing room between the composer and the top of the keyboard.
 *
 * Added only when there is something to clear: a window that resized itself
 * reports no overlap, and nudging it up anyway would move a composer that is
 * already sitting where it belongs.
 */
const KEYBOARD_GAP = 32;

/** What the keyboard animates over when the platform does not say. */
const FALLBACK_DURATION_MS = 250;

interface KeyboardLift {
  /** Animated, so the bar travels with the keyboard rather than jumping. */
  lift: Animated.Value;
  /** Whether it is raised at all - the padding below depends on it. */
  isLifted: boolean;
}

const useKeyboardLift = (composer: React.RefObject<View | null>): KeyboardLift => {
  const lift = useRef(new Animated.Value(0)).current;
  const [isLifted, setIsLifted] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    /**
     * Driven in JS rather than natively, which is forced: marginBottom is a
     * layout property, and the native driver only handles opacity and
     * transforms. A transform would animate more cheaply but would slide the
     * bar OVER the thread instead of shortening it, putting the newest comment
     * behind the field the user is typing into.
     */
    const animate = (toValue: number, duration: number) =>
      Animated.timing(lift, {
        toValue,
        // The platform's own keyboard duration where it offers one, so the bar
        // and the keys move as one thing instead of racing.
        duration: duration || FALLBACK_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();

    const shown = Keyboard.addListener(showEvent, (event) => {
      const keyboardTop = event.endCoordinates.screenY;

      composer.current?.measureInWindow((_x, y, _width, height) => {
        // Measured BEFORE any lift is applied, so this never compounds: the
        // hide handler returns it to zero, and a second show measures from rest.
        const overlap = y + height - keyboardTop;
        const next = overlap > 0 ? overlap + KEYBOARD_GAP : 0;

        setIsLifted(next > 0);
        animate(next, event.duration);
      });
    });

    const hidden = Keyboard.addListener(hideEvent, (event) => {
      setIsLifted(false);
      animate(0, event.duration);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [composer, lift]);

  return { lift, isLifted };
};

const defaultAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}`;

/**
 * One post, opened from the feed, with its comment thread.
 *
 * A push rather than a modal: new-post is a modal because composing is
 * finish-or-abandon, and reading is neither.
 *
 * The post is read from the shared store rather than fetched. The only way in
 * is a tap on a card the feed already loaded, so a request here would re-fetch
 * what is on screen - and reading the same array is what lets a like tapped
 * here update the card behind it.
 */
const PostDetail = () => {
  const { colors } = useTheme();
  const styles = usePostDetailStyles();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? "";

  const post = usePost(postId);
  const { comments, isLoading, error, isSubmitting, addComment } =
    useComments(postId);
  const { toggleLike, error: likeError } = useLikePost(setPostLiked);

  const [draft, setDraft] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);
  // Open or shut only. Unlike the feed, this screen already knows which post it
  // is showing, so there is no id to carry - and `post` comes from the same
  // store, so the dialog sees a filed report the moment it lands.
  const [reportOpen, setReportOpen] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const threadY = useRef(0);
  const composer = useRef<View>(null);
  const { lift: keyboardLift, isLifted } = useKeyboardLift(composer);

  // The API only ever answers oldest-first. Reversing here rather than
  // refetching is correct precisely because the thread is unpaginated - the
  // whole list is already in memory, so there is nothing to ask for.
  const ordered = useMemo(
    () => (newestFirst ? [...comments].reverse() : comments),
    [comments, newestFirst],
  );

  const submit = async () => {
    if (!(await addComment(draft))) return;

    setDraft("");
    // Only once it is actually posted. Dismissing on tap would pull the
    // keyboard down under a request that can still fail, leaving the user to
    // reopen it to fix whatever went wrong - and the hide event is what
    // animates the bar back down, so the reset is the same one gesture.
    Keyboard.dismiss();
  };

  if (!post) return <MissingPost />;

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {/*
          Outside the scroller, so it stays put: this screen is well over a
          viewport tall, and an exit that scrolls away strands anyone reading
          the thread. It cannot live inside the card either - that is
          overflow:hidden for its corners, and would clip it.
        */}
        <Pressable
          style={[styles.exit, { top: 14 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close and go back to the feed"
        >
          <Feather
            name="x"
            size={POST_DETAIL_EXIT_ICON_SIZE}
            color={colors.danger}
          />
        </Pressable>

        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            style={styles.card}
            colors={colors.gradients.surface}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          >
            <View style={styles.masthead}>
              <Text style={styles.title}>{post.title}</Text>
              <View style={styles.tie} />

              {/* Avatar left, name and age stacked right, the pair centred. */}
              <View style={styles.byline}>
                <Image
                  style={styles.avatar}
                  source={{
                    uri:
                      post.author.avatarUrl ??
                      defaultAvatar(post.author.displayName),
                  }}
                />
                <View style={styles.bylineText}>
                  <Text style={styles.name}>{post.author.displayName}</Text>
                  <Text style={styles.age}>
                    {formatRelativeTime(post.createdAt)}
                  </Text>
                </View>
              </View>
            </View>

            {post.imageUrl && (
              <Image
                style={styles.photo}
                source={{ uri: post.imageUrl }}
                resizeMode="cover"
              />
            )}

            {post.caption ? (
              <Text style={styles.caption}>{post.caption}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View>
                <Text style={styles.statLabel}>Time</Text>
                <Text style={styles.statValue}>{durationOf(post)}</Text>
              </View>
              <View>
                <Text style={styles.statLabel}>Goals Reached</Text>
                {/* Never derivable per post: a Goal is one row per user per
                    period and is never attached to a session. */}
                <Text style={styles.statValue}>{PLACEHOLDER}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => toggleLike(post)}
                accessibilityRole="button"
                accessibilityLabel="Like"
                accessibilityState={{ selected: post.isLiked }}
                style={({ pressed }) => [
                  styles.action,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <FontAwesome
                  name={post.isLiked ? "heart" : "heart-o"}
                  size={ACTION_ICON_SIZE}
                  color={post.isLiked ? colors.danger : colors.text}
                />
                <Text style={styles.actionCount}>{post.likeCount}</Text>
              </Pressable>

              <Pressable
                onPress={() =>
                  scroller.current?.scrollTo({ y: threadY.current, animated: true })
                }
                accessibilityRole="button"
                accessibilityLabel="Jump to the comments"
                style={({ pressed }) => [
                  styles.action,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <FontAwesome
                  name="comment-o"
                  size={ACTION_ICON_SIZE}
                  color={colors.text}
                />
                <Text style={styles.actionCount}>{post.commentCount}</Text>
              </Pressable>

              {/* The only action in this row with no count beside it, and
                  deliberately so: a report count on a post would tell its author
                  they had been reported. The fill of this glyph is visible to
                  the reporter alone.

                  Absent entirely on your own post, because the API refuses a
                  self-report - gone rather than dimmed, since a dimmed control
                  says "not now" and this one is "not ever". */}
              {post.isMine ? null : (
                <Pressable
                  onPress={() => setReportOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Report"
                  accessibilityState={{ selected: post.isReported }}
                  style={({ pressed }) => [
                    styles.action,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <FontAwesome
                    name={post.isReported ? "flag" : "flag-o"}
                    size={ACTION_ICON_SIZE}
                    color={post.isReported ? colors.danger : colors.text}
                  />
                </Pressable>
              )}
            </View>
          </LinearGradient>

          {/* The one element touching both screen edges. It works because the
              halves either side are different objects: a card above, open rows
              below. */}
          <View
            style={styles.seam}
            onLayout={(event) => {
              threadY.current = event.nativeEvent.layout.y;
            }}
          />

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Discussion</Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{comments.length}</Text>
            </View>

            <Pressable
              onPress={() => setNewestFirst((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={`Sorted ${newestFirst ? "newest" : "oldest"} first. Tap to reverse.`}
              style={({ pressed }) => [styles.sort, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.sortKey}>Sort by</Text>
              <Text style={styles.sortValue}>
                {newestFirst ? "Newest first" : "Oldest first"}
              </Text>
            </Pressable>
          </View>

          {(error || likeError) && (
            <View style={styles.error}>
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error ?? likeError}</Text>
            </View>
          )}

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
          ) : ordered.length === 0 ? (
            <Text style={styles.threadEmpty}>
              No comments yet. Say something.
            </Text>
          ) : (
            ordered.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))
          )}
        </ScrollView>

        <Animated.View
          ref={composer}
          style={[
            styles.composer,
            {
              // marginBottom rather than a transform: it shrinks the scroller
              // above, so the last comment stays reachable instead of hiding
              // behind a composer floating over it.
              marginBottom: keyboardLift,
              // The inset clears the home indicator, which the keyboard is
              // already covering - keeping both leaves a dead bar above the keys.
              paddingBottom: 12 + (isLifted ? 0 : insets.bottom),
            },
          ]}
        >
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_COMMENT_LENGTH}
            accessibilityLabel="Add a comment"
          />
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            accessibilityState={{
              disabled: !draft.trim() || isSubmitting,
              busy: isSubmitting,
            }}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || isSubmitting) && styles.sendDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.sendFill}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                /* Always the light palette's surface, never colors.text: this
                   sits on gradients.primary, the same mid blue in both themes. */
                <Feather name="send" size={18} color="#ffffff" />
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <ReportDialog
          post={reportOpen ? post : null}
          onClose={() => setReportOpen(false)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

/** Null session, running session and finished session are three states, not two. */
const durationOf = (post: FeedPost): string => {
  if (!post.session) return PLACEHOLDER;
  if (post.session.durationMinutes === null) return "In progress";
  return formatDuration(post.session.durationMinutes);
};

const CommentRow = ({ comment }: { comment: Comment }) => {
  const styles = usePostDetailStyles();

  return (
    <View style={styles.comment}>
      <Image
        style={styles.commentAvatar}
        source={{
          uri: comment.author.avatarUrl ?? defaultAvatar(comment.author.username),
        }}
      />
      <View style={styles.commentBody}>
        <View style={styles.commentTop}>
          {/* A handle, not a name: the comments endpoint selects only
              { id, username, avatarUrl }, so there is no name to show. */}
          <Text style={styles.commentHandle}>@{comment.author.username}</Text>
          <Text style={styles.commentAge}>
            {formatRelativeTime(comment.createdAt)}
            {comment.isEdited ? " - edited" : ""}
          </Text>
        </View>
        <Text style={styles.commentText}>{comment.body}</Text>
      </View>
    </View>
  );
};

/**
 * The store is empty, which happens on a cold start rather than on a bad id:
 * nothing has read the feed yet, and this screen deliberately does not fetch.
 * Says so plainly instead of spinning on a request that will never be made.
 */
const MissingPost = () => {
  const { colors } = useTheme();
  const styles = usePostDetailStyles();

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <Pressable
          style={[styles.exit, { top: 14 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back to the feed"
        >
          <Feather
            name="x"
            size={POST_DETAIL_EXIT_ICON_SIZE}
            color={colors.danger}
          />
        </Pressable>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Post unavailable</Text>
          <Text style={styles.missingBody}>
            Open it from the feed to read the discussion.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PostDetail;
