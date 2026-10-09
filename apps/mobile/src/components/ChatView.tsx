import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useReducedMotion,
  useKeyboardLift,
  CHAT_BACK_ICON_SIZE,
  SEND_ICON_SIZE,
} from "@theme";
import { useChat, MAX_MESSAGE_LENGTH, type ChatMessage, type UserSummary } from "@data";

import { defaultAvatar } from "./defaultAvatar";
import { clockTime, dayLabel, isSameDay } from "./chatTime";

/** Messages from one person closer together than this share one time label. */
const RUN_GAP_MS = 10 * 60 * 1000;
/** A new bubble's entrance. */
const ENTER_MS = 220;
/** The send button fading between usable and not. */
const SEND_FADE_MS = 120;
const SEND_DISABLED_OPACITY = 0.35;
/** The chevron that marks the header's profile section as tappable. */
const CHAT_PROFILE_ICON_SIZE = 16;
/** Space between the message box and the top of the keyboard while typing. */
const KEYBOARD_GAP = 30;

const keyOf = (message: ChatMessage): string => message.localId ?? message.id;

interface ChatRowProps {
  message: ChatMessage;
  /** The message before this one in time, if any - decides the day separator. */
  older?: ChatMessage;
  /** The message after this one in time, if any - decides the time label. */
  newer?: ChatMessage;
  /** Play the entrance: true only for a bubble that arrived while the chat was open. */
  animate: boolean;
  onAnimated: (key: string) => void;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
}

/**
 * One message, with what hangs off it: the day separator above it when it is
 * the first of its day, and the time below it when it ends a run - the same
 * person, the same day, nothing more than RUN_GAP_MS apart. Grouping times by
 * run is what keeps a burst of five texts from carrying five identical times.
 */
const ChatRow = ({
  message,
  older,
  newer,
  animate,
  onAnimated,
  onRetry,
  onDiscard,
}: ChatRowProps) => {
  const styles = useStyles("messages");
  const enter = useRef(new Animated.Value(animate ? 0 : 1)).current;

  // Mount-only on purpose: a row redrawn later - scrolled out and back, or
  // re-rendered as its neighbours change - must not play its entrance again.
  useEffect(() => {
    if (!animate) return;
    onAnimated(keyOf(message));
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  const startsDay = !older || !isSameDay(older.createdAt, message.createdAt);
  const endsRun =
    !newer ||
    newer.isMine !== message.isMine ||
    !isSameDay(newer.createdAt, message.createdAt) ||
    newer.createdAt - message.createdAt > RUN_GAP_MS;
  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";

  return (
    <View style={styles.row}>
      {startsDay ? <Text style={styles.daySeparator}>{dayLabel(message.createdAt)}</Text> : null}

      <Animated.View
        style={[
          message.isMine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
          {
            opacity: enter,
            transform: [
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          },
        ]}
      >
        <Pressable
          // Only a refused message does anything when touched: tap to send it
          // again, hold to give up on it.
          disabled={!isFailed}
          onPress={() => onRetry(message.id)}
          onLongPress={() => onDiscard(message.id)}
          accessibilityRole={isFailed ? "button" : undefined}
          accessibilityLabel={`${message.isMine ? "You" : "Them"}: ${message.body}${
            isFailed ? ". Not sent" : isSending ? ". Sending" : ""
          }`}
          accessibilityHint={isFailed ? "Double tap to send again. Long press to delete it." : undefined}
          style={[
            styles.bubble,
            message.isMine ? styles.bubbleMine : styles.bubbleTheirs,
            isSending && styles.bubbleSending,
            isFailed && styles.bubbleFailed,
          ]}
        >
          <Text style={[styles.bubbleText, message.isMine && styles.bubbleTextMine]}>
            {message.body}
          </Text>
        </Pressable>
      </Animated.View>

      {isFailed ? (
        <Text style={[styles.bubbleTime, styles.bubbleTimeFailed]} onPress={() => onRetry(message.id)}>
          Not sent · Tap to retry
        </Text>
      ) : isSending || endsRun ? (
        <Text
          style={[
            styles.bubbleTime,
            message.isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs,
          ]}
        >
          {isSending ? "Sending…" : clockTime(message.createdAt)}
        </Text>
      ) : null}
    </View>
  );
};

interface ChatViewProps {
  user: UserSummary;
  onBack: () => void;
  /** Tapping the header's avatar or name - opens this person's profile. */
  onOpenProfile: (user: UserSummary) => void;
}

/**
 * One conversation: a header with the way back, the history, and a message
 * box - laid out as the mockup's chat.
 *
 * The history is an INVERTED list, the standard shape for a chat: the newest
 * message sits at the bottom where the eye and the keyboard are, the list
 * opens there without a scroll-to-end, and older pages load as the reader
 * scrolls up towards them.
 *
 * Only bubbles that arrive while the chat is open - sent or received - play an
 * entrance; history appears at rest, because animating forty old messages in
 * would be noise rather than news.
 */
const ChatView = ({ user, onBack, onOpenProfile }: ChatViewProps) => {
  const { colors } = useTheme();
  const styles = useStyles("messages");
  const reducedMotion = useReducedMotion();
  const {
    messages,
    isLoading,
    hasMore,
    isLoadingOlder,
    loadOlder,
    send,
    retry,
    discard,
    error,
    reload,
  } = useChat(user);

  const [draft, setDraft] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const firstName = user.displayName.split(" ")[0];

  // The message box rides above the keyboard with KEYBOARD_GAP of air - enough
  // that its rounded bottom edge clears the keys' top bar and the whole box
  // is visible while typing, less than the comment box's 32 because the
  // bubbles directly above it are the context.
  const composer = useRef<View>(null);
  const { lift } = useKeyboardLift(composer, KEYBOARD_GAP);

  const canSend = draft.trim().length > 0;
  const sendOpacity = useRef(new Animated.Value(SEND_DISABLED_OPACITY)).current;
  useEffect(() => {
    Animated.timing(sendOpacity, {
      toValue: canSend ? 1 : SEND_DISABLED_OPACITY,
      duration: reducedMotion ? 0 : SEND_FADE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [canSend, reducedMotion, sendOpacity]);

  /**
   * Which bubbles play their entrance.
   *
   * Everything held when the history first lands is `known` and stays still.
   * After that, keys newly at the FRONT of the list (newest first) are arrivals
   * and animate; keys newly at the BACK are an older page and settle silently.
   * `pending` holds arrivals until their row has mounted and started playing,
   * so a row virtualised away and back does not play twice.
   */
  const known = useRef<Set<string> | null>(null);
  const pending = useRef(new Set<string>());
  if (known.current === null) {
    if (!isLoading) known.current = new Set(messages.map(keyOf));
  } else {
    for (const message of messages) {
      const key = keyOf(message);
      if (known.current.has(key)) break;
      known.current.add(key);
      if (!reducedMotion) pending.current.add(key);
    }
    for (const message of messages) known.current.add(keyOf(message));
  }

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    // Cleared at once and the keyboard left up: a chat is a back-and-forth,
    // and the next message is usually seconds away.
    setDraft("");
    send(text);
  };

  const header = (
    <View style={styles.chatHead}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to messages"
        hitSlop={6}
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
      >
        <Feather name="chevron-left" size={CHAT_BACK_ICON_SIZE} color={colors.text} />
      </Pressable>
      {/* Who this chat is with, and the way to their profile: avatar, name
          and handle are one target, with a chevron so it reads as tappable. */}
      <Pressable
        onPress={() => onOpenProfile(user)}
        accessibilityRole="button"
        accessibilityLabel={`View ${user.displayName}'s profile`}
        style={({ pressed }) => [styles.chatProfile, pressed && { opacity: 0.6 }]}
      >
        <Image
          source={{ uri: user.avatarUrl ?? defaultAvatar(user.displayName) }}
          style={styles.chatAvatar}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.chatWho}>
          <Text style={styles.chatName} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text style={styles.chatHandle} numberOfLines={1}>
            @{user.username}
          </Text>
        </View>
        <Feather name="chevron-right" size={CHAT_PROFILE_ICON_SIZE} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  let body;
  if (messages.length === 0) {
    // Outside the list on purpose: an inverted FlatList draws its empty
    // component upside down.
    body = (
      <View style={styles.chatEmpty}>
        {isLoading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : error ? (
          <>
            <Text style={styles.chatEmptyTitle}>Couldn’t load this chat</Text>
            <Text style={styles.chatEmptyText}>{error}</Text>
            <Text
              style={[styles.chatEmptyText, { color: colors.primary }]}
              onPress={reload}
              accessibilityRole="button"
            >
              Try again
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.chatEmptyTitle}>Say hello to {firstName}</Text>
            <Text style={styles.chatEmptyText}>Messages you send will appear here.</Text>
          </>
        )}
      </View>
    );
  } else {
    body = (
      <FlatList
        style={styles.log}
        data={messages}
        inverted
        keyExtractor={keyOf}
        // A new message changes its neighbour's time label, so every visible
        // row re-renders when the list does, not only the new one.
        extraData={messages}
        renderItem={({ item, index }) => (
          <ChatRow
            message={item}
            older={messages[index + 1]}
            newer={index > 0 ? messages[index - 1] : undefined}
            animate={pending.current.has(keyOf(item))}
            onAnimated={(key) => pending.current.delete(key)}
            onRetry={retry}
            onDiscard={discard}
          />
        )}
        onEndReached={hasMore ? loadOlder : undefined}
        onEndReachedThreshold={0.4}
        // The FOOTER of an inverted list is at the top - where older pages load.
        ListFooterComponent={
          isLoadingOlder ? (
            <ActivityIndicator style={styles.olderSpinner} color={colors.textMuted} />
          ) : null
        }
        contentContainerStyle={styles.logContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <View style={styles.chat}>
      {header}
      {body}
      {error && messages.length > 0 ? (
        <Text style={styles.chatError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Animated.View ref={composer} style={[styles.composer, { marginBottom: lift }]}>
        <TextInput
          style={[styles.composerInput, isFocused && styles.composerInputFocused]}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={`Message ${firstName}…`}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          accessibilityLabel={`Message ${user.displayName}`}
        />
        <Animated.View style={{ opacity: sendOpacity }}>
          <Pressable
            onPress={submit}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            style={({ pressed }) => [styles.send, pressed && { opacity: 0.8 }]}
          >
            {/* The page's ground, not white: solid primary is a pale blue in
                dark mode - the same rule the bubbles follow. */}
            <Feather name="send" size={SEND_ICON_SIZE} color={colors.bg} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

export default ChatView;
