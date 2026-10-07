import { useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  ActivityIndicator,
  LayoutAnimation,
} from "react-native";

import { useTheme, useStyles, useReducedMotion } from "@theme";
import { useConversations, type ConversationSummary, type UserSummary } from "@data";

import { defaultAvatar } from "./defaultAvatar";
import { listTime } from "./chatTime";

interface ConversationListProps {
  onOpenChat: (user: UserSummary) => void;
}

/**
 * The messages page's first view: everyone you have been talking to, most
 * recent first.
 *
 * Built from the recent-searches rows - the same avatar, rhythm and divider -
 * so the drop-down pages read as one family. What a conversation adds: the
 * time of the last message, a one-line preview of it, and, while there is
 * anything unread, the name and preview in bold with a count beside them.
 */
const ConversationList = ({ onOpenChat }: ConversationListProps) => {
  const { colors } = useTheme();
  const searchStyles = useStyles("homeSearch");
  const styles = useStyles("messages");
  const reducedMotion = useReducedMotion();
  const { conversations, isLoading, error, reload } = useConversations();
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Eases rows into their new places when a message moves a conversation to
   * the top, instead of the list snapping into a new order under the reader's
   * thumb. Configured during render when the order is seen to change - the
   * change comes from the store, not from a handler here - and only arms the
   * next layout pass, so a repeat call is harmless.
   */
  const order = conversations.map((row) => row.user.id).join(",");
  const previousOrder = useRef(order);
  if (previousOrder.current !== order) {
    if (previousOrder.current && !reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    previousOrder.current = order;
  }

  const refresh = () => {
    setIsRefreshing(true);
    reload();
    // reload is fire-and-forget; the spinner only needs to acknowledge the pull.
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const renderItem = ({ item }: { item: ConversationSummary }) => {
    const isUnread = item.unreadCount > 0;
    const preview = `${item.lastMessage.isMine ? "You: " : ""}${item.lastMessage.body}`;
    return (
      <View style={searchStyles.userRow}>
        <Pressable
          onPress={() => onOpenChat(item.user)}
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${item.user.displayName}${
            isUnread ? `, ${item.unreadCount} unread` : ""
          }. ${preview}`}
          style={({ pressed }) => [searchStyles.userMain, pressed && { opacity: 0.6 }]}
        >
          <Image
            source={{ uri: item.user.avatarUrl ?? defaultAvatar(item.user.displayName) }}
            style={searchStyles.userAvatar}
            accessibilityIgnoresInvertColors
          />
          <View style={styles.convText}>
            <View style={styles.convLine}>
              <Text
                style={[styles.convName, isUnread && styles.convNameUnread]}
                numberOfLines={1}
              >
                {item.user.displayName}
              </Text>
              <Text style={[styles.convTime, isUnread && styles.convTimeUnread]}>
                {listTime(item.lastMessageAt)}
              </Text>
            </View>
            <View style={styles.convLine}>
              <Text
                style={[styles.convPreview, isUnread && styles.convPreviewUnread]}
                numberOfLines={1}
              >
                {preview}
              </Text>
              {isUnread ? (
                <View style={styles.pill}>
                  <Text style={styles.pillLabel}>
                    {item.unreadCount > 99 ? "99+" : item.unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const empty = isLoading ? (
    <View style={searchStyles.emptyState}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  ) : (
    <View style={searchStyles.emptyState}>
      <Text style={searchStyles.emptyTitle}>No messages yet</Text>
      <Text style={searchStyles.emptyText}>People you message will show here.</Text>
    </View>
  );

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.user.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <>
          <View style={searchStyles.sectionHead}>
            <Text style={searchStyles.sectionTitle}>Messages</Text>
          </View>
          {error ? (
            <Text style={[searchStyles.error, { paddingBottom: 6 }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </>
      }
      ListEmptyComponent={empty}
      contentContainerStyle={searchStyles.sheetContent}
      showsVerticalScrollIndicator={false}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};

export default ConversationList;
