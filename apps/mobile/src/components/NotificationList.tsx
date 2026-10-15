import { useRef, useState, type ComponentProps } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  LayoutAnimation,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useReducedMotion,
  SEARCH_ROW_ICON_SIZE,
  NOTIFICATION_ICON_SIZE,
} from "@theme";
import { formatRelativeTime } from "@stdyapp/shared";
import type {
  AppNotification,
  NotificationType,
  NotificationsState,
  UserSummary,
} from "@data";

/**
 * Where the actor's name sits in the message, if it is there at all.
 *
 * The API wrote the message with the actor's name as it was THEN; `actor` is
 * who they are NOW. When the two still match, the name in the text becomes the
 * link. When they do not - the person has renamed since - nothing is linked,
 * rather than linking a name that no longer belongs to anyone.
 */
const splitOnActor = (notification: AppNotification) => {
  const actor = notification.actor;
  if (!actor) return null;
  const at = notification.message.indexOf(actor.displayName);
  if (at === -1) return null;
  return {
    actor,
    before: notification.message.slice(0, at),
    name: actor.displayName,
    after: notification.message.slice(at + actor.displayName.length),
  };
};

/**
 * One icon per kind of notification. Keyed by the type, so a kind added to the
 * data layer without an icon here is a type error rather than a blank circle.
 */
const ICONS: Record<NotificationType, ComponentProps<typeof Feather>["name"]> = {
  FOLLOW: "user-plus",
  POST_LIKE: "heart",
  POST_COMMENT: "message-circle",
  GROUP_JOIN: "users",
  STREAK_MILESTONE: "zap",
  GOAL_REACHED: "target",
  SYSTEM: "info",
};

type NotificationListProps = Pick<
  NotificationsState,
  "notifications" | "isLoading" | "error" | "remove" | "clearAll" | "reload"
> & {
  /**
   * Notifications that were unread when this page opened. Opening the page
   * marks everything read - that is what clears the counter - but these keep
   * their "new" look until the page closes, so someone can still see which
   * ones they came here for.
   */
  freshIds: ReadonlySet<string>;
  /** Called with the person whose name was tapped. The screen opens their profile. */
  onOpenUser: (user: UserSummary) => void;
};

/**
 * The notifications page: a header with Clear all, then one row per
 * notification, each with its own remove button.
 *
 * Built as a sibling of the recent-searches page - the same header, the same
 * row rhythm, the same × - so the two drop-down lists read as one family. Where
 * a search row shows a face, this shows the KIND of thing that happened. When a
 * person caused it, their name in the message is a link to their profile.
 *
 * Takes the notifications rather than reading them, so the screen that opens
 * this page is also the one that marks them read when it does.
 */
const NotificationList = ({
  notifications,
  isLoading,
  error,
  remove,
  clearAll,
  reload,
  freshIds,
  onOpenUser,
}: NotificationListProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const reducedMotion = useReducedMotion();
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Eases rows in and out as the list changes - a notification arriving over
   * the socket slides the rest down rather than shoving them; a removed row
   * closes its gap rather than snapping it shut.
   *
   * Configured during render, when the length is seen to change, because the
   * change comes from the shared store rather than from a handler here that
   * could configure it first. configureNext only arms the NEXT layout pass, so
   * calling it again on a re-render is harmless.
   */
  const previousLength = useRef(notifications.length);
  if (previousLength.current !== notifications.length) {
    previousLength.current = notifications.length;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }

  const refresh = () => {
    setIsRefreshing(true);
    reload();
    // reload is fire-and-forget; the spinner only needs to acknowledge the pull.
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const header = (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Notifications</Text>
      {notifications.length > 0 ? (
        <Pressable onPress={clearAll} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.linkLabel}>Clear all</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const empty = isLoading ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  ) : (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No notifications</Text>
      <Text style={styles.emptyText}>You’re all caught up.</Text>
    </View>
  );

  const renderItem = ({ item }: { item: AppNotification }) => {
    const isNew = !item.isRead || freshIds.has(item.id);
    const linked = splitOnActor(item);
    return (
    <View style={styles.userRow}>
      <View
        style={styles.notificationMain}
        // Grouped into one spoken label only when there is nothing inside to
        // press: grouping a row with a link would hide the link from VoiceOver
        // and TalkBack, which then reach it as its own element instead.
        accessible={!linked}
        accessibilityLabel={
          linked
            ? undefined
            : `${isNew ? "New. " : ""}${item.message} ${formatRelativeTime(item.createdAt)}`
        }
      >
        <View style={styles.notificationIcon}>
          <View style={styles.notificationIconTint} />
          <Feather name={ICONS[item.type]} size={NOTIFICATION_ICON_SIZE} color={colors.primary} />
        </View>
        <View style={styles.notificationText}>
          <Text
            style={[styles.notificationMessage, isNew && styles.notificationMessageUnread]}
            numberOfLines={2}
          >
            {linked ? (
              <>
                {linked.before}
                {/* A nested Text, so the link wraps with the sentence instead of
                    breaking it into a separate block. */}
                <Text
                  style={styles.notificationLink}
                  onPress={() => onOpenUser(linked.actor)}
                  suppressHighlighting={false}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${linked.name}'s profile`}
                >
                  {linked.name}
                </Text>
                {linked.after}
              </>
            ) : (
              item.message
            )}
          </Text>
          <View style={styles.notificationMeta}>
            {isNew ? <View style={styles.notificationUnreadDot} /> : null}
            <Text style={styles.userHandle}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => remove(item.id)}
        accessibilityRole="button"
        accessibilityLabel="Remove notification"
        hitSlop={6}
        style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.6 }]}
      >
        <Feather name="x" size={SEARCH_ROW_ICON_SIZE} color={colors.textMuted} />
      </Pressable>
    </View>
    );
  };

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <>
          {header}
          {error ? (
            <Text style={[styles.error, { paddingBottom: 6 }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </>
      }
      ListEmptyComponent={empty}
      contentContainerStyle={styles.sheetContent}
      showsVerticalScrollIndicator={false}
      onRefresh={refresh}
      refreshing={isRefreshing}
    />
  );
};

export default NotificationList;
