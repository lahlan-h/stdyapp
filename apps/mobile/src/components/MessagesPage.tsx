import { useEffect, useRef, useState } from "react";
import { View, Animated, Easing, useWindowDimensions } from "react-native";

import { useStyles, useReducedMotion } from "@theme";
import type { UserSummary } from "@data";

import ConversationList from "./ConversationList";
import ChatView from "./ChatView";

/** The chat slides in; going back is a touch quicker, as everywhere in this app. */
const CHAT_IN_MS = 260;
const CHAT_OUT_MS = 220;
/** How far the list drifts left, and how much it dims, while a chat covers it. */
const LIST_SHIFT = 0.18;
const LIST_DIM = 0.55;

interface MessagesPageProps {
  /** The open chat, or null for the conversation list. Owned by the Home screen. */
  chatUser: UserSummary | null;
  onOpenChat: (user: UserSummary) => void;
  /** The chat header's avatar or name was tapped. */
  onOpenProfile: (user: UserSummary) => void;
  onBack: () => void;
}

/**
 * The messages drop-down page: the conversation list, with a chat that slides
 * over it from the right.
 *
 * Two layers rather than a swap. The list stays mounted underneath while a
 * chat is open, so going back returns to it exactly as it was left - scroll
 * position included - and the motion reads as one page pushed over another:
 * the chat comes in from the right edge while the list eases a little to the
 * left and dims, and back plays it in reverse. The mockup's chat-in and
 * list-back, on the native driver.
 *
 * The chat layer TRAILS `chatUser` the way the drop-down page trails its mode:
 * kept mounted until its slide out has finished, so the chat does not blank
 * out mid-exit. Opened with a chat already set - from a profile's Message
 * button - it starts in place, because the page dropping down is the
 * transition there.
 */
const MessagesPage = ({ chatUser, onOpenChat, onOpenProfile, onBack }: MessagesPageProps) => {
  const styles = useStyles("messages");
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();

  const progress = useRef(new Animated.Value(chatUser ? 1 : 0)).current;
  const [shownUser, setShownUser] = useState<UserSummary | null>(chatUser);

  useEffect(() => {
    if (chatUser) {
      setShownUser(chatUser);
      const slideIn = Animated.timing(progress, {
        toValue: 1,
        duration: reducedMotion ? 0 : CHAT_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      slideIn.start();
      return () => slideIn.stop();
    }

    const slideOut = Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : CHAT_OUT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    // `finished` guards a chat reopened mid-exit from being unmounted.
    slideOut.start(({ finished }) => {
      if (finished) setShownUser(null);
    });
    return () => slideOut.stop();
  }, [chatUser, progress, reducedMotion]);

  const chatOpen = chatUser !== null;

  return (
    <View style={styles.page}>
      <Animated.View
        style={[
          styles.layer,
          {
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, LIST_DIM] }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width * LIST_SHIFT],
                }),
              },
            ],
          },
        ]}
        // Covered, so neither touchable nor read aloud while a chat is open.
        pointerEvents={chatOpen ? "none" : "auto"}
        importantForAccessibility={chatOpen ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={chatOpen}
      >
        <ConversationList onOpenChat={onOpenChat} />
      </Animated.View>

      {shownUser ? (
        <Animated.View
          style={[
            styles.layer,
            styles.chatLayer,
            {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={chatOpen ? "auto" : "none"}
        >
          {/* Keyed by person, so opening a different chat starts it fresh. */}
          <ChatView
            key={shownUser.id}
            user={shownUser}
            onBack={onBack}
            onOpenProfile={onOpenProfile}
          />
        </Animated.View>
      ) : null}
    </View>
  );
};

export default MessagesPage;
