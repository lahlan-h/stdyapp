import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  StatusBar,
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  Keyboard,
  type TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useNavigation } from "expo-router";
import type { BottomTabNavigationProp } from "expo-router/js-tabs";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useTabBarClearance,
  useReducedMotion,
  HOME_PANEL_HEIGHT,
  BAR_HEIGHT,
  FEED_FAB_ICON_SIZE,
  FEED_FAB_MARGIN,
  FEED_FAB_CLEARANCE,
} from "@theme";
import {
  usePosts,
  useLikePost,
  consumeFeedStale,
  defaultFeedFilters,
  isDefaultFilters,
  useNotifications,
  useRecentSearches,
  useConversations,
  consumeChatRequest,
  requestChat,
  type FeedFilters,
  type FeedPost,
  type UserSummary,
} from "@data";

import PostCard from "@components/PostCard";
import LoadingSpinner from "@components/LoadingSpinner";
import EmptyFeed from "@components/EmptyFeed";
import ReportDialog from "@components/ReportDialog";
import HomeSearchPanel, { type HomeSheetMode } from "@components/HomeSearchPanel";
import HomeDropSheet from "@components/HomeDropSheet";
import UserSearchList from "@components/UserSearchList";
import FeedFilterPanel from "@components/FeedFilterPanel";
import NotificationList from "@components/NotificationList";
import MessagesPage from "@components/MessagesPage";

/** Space between the panel's lower edge and the first card. Matches the old list padding. */
const FEED_TOP_GAP = 8;

/**
 * How long the notifications page is open before its contents count as read.
 * Roughly the drop animation: the counter clears as the page lands, not while
 * it is still falling, so the two read as cause and effect.
 */
const MARK_READ_DELAY_MS = 400;

const NO_IDS: ReadonlySet<string> = new Set();

/** How far the feed dims while a changed filter is being read. */
const REFRESHING_OPACITY = 0.45;
const DIM_MS = 120;
const REVEAL_MS = 180;

type TabNavigation = BottomTabNavigationProp<Record<string, object | undefined>>;

const Index = () => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<TabNavigation>();
  // What the floating tab bar covers, inset included. Without it the last
  // card's like, comment and report buttons sit behind the bar, drawn but
  // untappable, with nothing on screen explaining why.
  const tabBarClearance = useTabBarClearance();

  /**
   * The feed's filter. Screen state rather than module state: the tab stays
   * mounted while another tab is showing, so it survives a trip to Settings,
   * and a fresh launch starts unfiltered - which is what someone opening the
   * app expects to see.
   */
  const [filters, setFilters] = useState<FeedFilters>(defaultFeedFilters);
  const [sheet, setSheet] = useState<HomeSheetMode | null>(null);
  const [query, setQuery] = useState("");

  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<FeedPost>>(null);

  const {
    posts,
    isLoading,
    isRefreshing,
    canLoadMore,
    loadMore,
    error,
    refresh,
    setLiked,
  } = usePosts(filters);
  // usePosts owns the array, so the optimistic update is handed back to it
  // rather than kept a second time over there - see SetLiked.
  const { toggleLike, error: likeError } = useLikePost(setLiked);

  /**
   * Which post the report dialog is open for, held as an ID rather than the row.
   *
   * The row is then looked up out of `posts` on every render, so the dialog sees
   * the post as the store currently holds it. A captured object would go stale
   * the moment the report landed, and the dialog would offer to file a report it
   * had just filed.
   */
  const [reportingId, setReportingId] = useState<string | null>(null);
  const reporting = posts.find((post) => post.id === reportingId) ?? null;

  // Re-reads only when something actually wrote, rather than on every focus:
  // refreshing on each tab switch would discard every page past the first to
  // catch a change that usually has not happened.
  useFocusEffect(
    useCallback(() => {
      if (consumeFeedStale()) refresh();
    }, [refresh]),
  );

  // ---- The drop-down page ----------------------------------------------------

  /**
   * Closing always leaves search clean: the box empties and gives up the
   * keyboard, so the next open starts at recent searches rather than a stale
   * query nobody remembers typing.
   */
  const closeSheet = useCallback(() => {
    setSheet(null);
    setQuery("");
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  // Focusing the box IS opening search - including straight from the filter
  // page, which then swaps its contents rather than closing and re-dropping.
  const openSearch = useCallback(() => setSheet("search"), []);

  /**
   * The filter button toggles its own page. From the search page it switches
   * over instead, letting go of the keyboard and the half-typed query on the way.
   */
  const pressFilter = useCallback(() => {
    if (sheet === "filter") {
      closeSheet();
      return;
    }
    inputRef.current?.blur();
    Keyboard.dismiss();
    setQuery("");
    setSheet("filter");
  }, [sheet, closeSheet]);

  const openUser = useCallback(
    (user: UserSummary) => {
      closeSheet();
      router.push(`/user/${user.id}`);
    },
    [closeSheet],
  );

  // ---- Messages --------------------------------------------------------------

  /**
   * The chat open on the messages page, or null for the conversation list.
   *
   * Deliberately NOT cleared when the page closes - the chat would blank out
   * while the page is still sliding away. It is reset when the page is next
   * opened from the button instead, which always starts on the list.
   */
  const [chatUser, setChatUser] = useState<UserSummary | null>(null);

  // Live, like notifications: the socket writes into the store this reads.
  const { unread: unreadMessages } = useConversations();

  /** The message button toggles its page, and always opens it on the list. */
  const pressMessages = useCallback(() => {
    if (sheet === "messages") {
      closeSheet();
      return;
    }
    inputRef.current?.blur();
    Keyboard.dismiss();
    setQuery("");
    setChatUser(null);
    setSheet("messages");
  }, [sheet, closeSheet]);

  /** Opens the messages page straight into a chat - for a profile's Message button. */
  /**
   * The chat header's avatar or name: opens that person's profile, and comes
   * BACK to the chat afterwards. The chat request left first is what does
   * that - the focus effect below takes it when Home is shown again, exactly
   * as it takes the one the profile's Message button leaves.
   */
  const openProfileFromChat = useCallback(
    (user: UserSummary) => {
      requestChat(user);
      openUser(user);
    },
    [openUser],
  );

  const openChat = useCallback((user: UserSummary) => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setQuery("");
    setChatUser(user);
    setSheet("messages");
  }, []);

  /**
   * A profile's Message button leaves its request in chatRequest and pops back
   * here; taking it on focus drops the page straight into that chat.
   */
  useFocusEffect(
    useCallback(() => {
      const requested = consumeChatRequest();
      if (requested) openChat(requested);
    }, [openChat]),
  );

  /** Android back from a chat steps out to the list before it closes anything. */
  const sheetBack = useCallback(() => {
    if (sheet === "messages" && chatUser) {
      setChatUser(null);
      return true;
    }
    return false;
  }, [sheet, chatUser]);

  // ---- Notifications ---------------------------------------------------------

  // Live: the socket the tab layout keeps open writes straight into the store
  // this reads, so the counter moves the moment something arrives.
  const {
    notifications,
    unread,
    isLoading: notificationsLoading,
    error: notificationsError,
    remove: removeNotification,
    clearAll: clearNotifications,
    markAllRead,
    reload: reloadNotifications,
  } = useNotifications();

  /**
   * A name tapped in a notification opens that person exactly as a search
   * result does - and, like one, puts them at the top of recent searches, so
   * someone just met through a notification is a tap away next time.
   */
  const { add: addRecentSearch } = useRecentSearches();
  const openUserFromNotification = useCallback(
    (user: UserSummary) => {
      addRecentSearch(user);
      openUser(user);
    },
    [addRecentSearch, openUser],
  );

  /** The lightbulb toggles its own page, exactly as the filter button does. */
  const pressNotifications = useCallback(() => {
    if (sheet === "notifications") {
      closeSheet();
      return;
    }
    inputRef.current?.blur();
    Keyboard.dismiss();
    setQuery("");
    setSheet("notifications");
  }, [sheet, closeSheet]);

  /**
   * Opening the page is reading it: once it has landed, everything in it is
   * marked read and the counter clears. That includes anything that arrives
   * while it is open - someone looking at the list has seen the new row.
   *
   * What WAS unread is remembered for as long as the page stays open, so those
   * rows keep their "new" look - see NotificationList's freshIds. Forgotten when
   * the page closes, so the next visit shows only what is new since this one.
   */
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(NO_IDS);
  useEffect(() => {
    if (sheet !== "notifications") {
      setFreshIds(NO_IDS);
      return;
    }
    const unreadIds = notifications.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0 && unread === 0) return;

    const timer = setTimeout(() => {
      setFreshIds((previous) => new Set([...previous, ...unreadIds]));
      markAllRead();
    }, MARK_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sheet, notifications, unread, markAllRead]);

  /**
   * Home pressed while already on Home: close the page if one is open,
   * otherwise go back to the top - the usual meaning of tapping the tab you are
   * on. TabBar emits tabPress for exactly this.
   *
   * Read through a ref so the listener is attached once rather than re-attached
   * every time a page opens or closes.
   */
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  useEffect(
    () =>
      navigation.addListener("tabPress", () => {
        if (!navigation.isFocused()) return;
        if (sheetRef.current) closeSheet();
        else listRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion });
      }),
    [navigation, closeSheet, reducedMotion],
  );

  // ---- The feed under a changing filter ----------------------------------------

  /**
   * Dims the posts while a changed filter is read, then brings the new page up.
   *
   * Dimmed, not swapped for a spinner: a chip tap that blanked the feed would
   * read as the app losing everything, when all it is doing is reordering.
   */
  const feedOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(feedOpacity, {
      toValue: isRefreshing && !isLoading ? REFRESHING_OPACITY : 1,
      duration: reducedMotion ? 0 : isRefreshing ? DIM_MS : REVEAL_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isRefreshing, isLoading, reducedMotion, feedOpacity]);

  // A new filter starts at the top of its results, not wherever the old ones
  // happened to be scrolled to.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filterKey]);

  const hasFilters = !isDefaultFilters(filters);

  // Everything below the panel starts here: the panel is drawn over the status
  // bar and owns the top inset itself.
  const panelBottom = insets.top + HOME_PANEL_HEIGHT;

  /**
   * An empty feed means different things filtered and unfiltered. With no
   * filter it is a new app - EmptyFeed's "log a session". With one, posts exist
   * and the filter ruled them out, so it says that and offers the way back.
   */
  const emptyFeed = hasFilters ? (
    <View style={homeStyles.emptyContainer}>
      <Text style={homeStyles.bold}>No posts match these filters</Text>
      <Text style={homeStyles.soft}>Try a wider date range, or clear the filters.</Text>
      <Pressable
        onPress={() => setFilters(defaultFeedFilters())}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={[homeStyles.bold, { color: colors.primary }]}>Clear filters</Text>
      </Pressable>
    </View>
  ) : (
    <EmptyFeed />
  );

  return (
    <LinearGradient colors={colors.gradients.background} style={homeStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      {/* No top edge: the pinned panel sits under the status bar and pads
          itself by the inset, so the feed can scroll up behind both. */}
      <SafeAreaView style={homeStyles.safeArea} edges={["left", "right"]}>
        {isLoading ? (
          <LoadingSpinner />
        ) : error && posts.length === 0 ? (
          // Only when there is nothing to show. An error while more pages load
          // must not blank a feed the user is already reading.
          <View style={[homeStyles.emptyContainer, { paddingTop: panelBottom }]}>
            <Text style={homeStyles.bold}>Can&apos;t load the feed</Text>
            <Text style={homeStyles.soft}>{error}</Text>
          </View>
        ) : (
          <Animated.View style={[homeStyles.postCardList, { opacity: feedOpacity }]}>
            <FlatList
              ref={listRef}
              data={posts}
              keyExtractor={(post: FeedPost) => post.id}
              renderItem={({ item }: { item: FeedPost }) => (
                <PostCard
                  post={item}
                  onToggleLike={() => toggleLike(item)}
                  onReport={() => setReportingId(item.id)}
                />
              )}
              style={homeStyles.postCardList}
              contentContainerStyle={[
                homeStyles.postCardListContent,
                // The first card starts below the panel rather than under it;
                // later cards scroll up behind the blur. At the bottom, the bar
                // AND the add-post circle above it: without the second, the
                // last card's buttons would end up under the circle.
                {
                  paddingTop: panelBottom + FEED_TOP_GAP,
                  paddingBottom: tabBarClearance + FEED_FAB_CLEARANCE,
                },
                posts.length === 0 && { flexGrow: 1 },
              ]}
              // A rolled-back like says so above the feed rather than in an
              // alert: the heart has already snapped back, so this only explains
              // a change the user can already see undone.
              ListHeaderComponent={
                likeError ? (
                  <Text style={homeStyles.soft}>{likeError}</Text>
                ) : null
              }
              ListEmptyComponent={emptyFeed}
              showsVerticalScrollIndicator={false}
              onRefresh={refresh}
              refreshing={false}
              // Without this Android draws the pull-to-refresh spinner under
              // the panel, where nobody can see it.
              progressViewOffset={panelBottom}
              onEndReached={canLoadMore ? loadMore : undefined}
              onEndReachedThreshold={0.5}
            />
          </Animated.View>
        )}

        {/*
          The add-post circle. It lived in the middle of the tab bar; it is on
          the Feed now because the Feed is where posts appear, and the bar
          slot went to Analytics. Shown in every state, loading and empty
          included - a first post is the cure for an empty feed. Drawn BEFORE
          the drop-down page, so an open page covers it.
        */}
        <View
          style={[homeStyles.fabWrap, { bottom: tabBarClearance + FEED_FAB_MARGIN }]}
          pointerEvents="box-none"
        >
          <Pressable
            style={({ pressed }) => [homeStyles.fabRing, pressed && { opacity: 0.6 }]}
            onPress={() => router.push("/new-post")}
            accessibilityRole="button"
            accessibilityLabel="New post"
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={homeStyles.fab}
            >
              {/* White in both themes: gradients.primary is the same blue in each. */}
              <Feather name="plus" size={FEED_FAB_ICON_SIZE} color="#ffffff" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Drawn AFTER the feed and BEFORE the panel: over the posts, but
            dropping out from behind the panel's edge. */}
        <HomeDropSheet
          mode={sheet}
          top={panelBottom}
          bottom={BAR_HEIGHT + insets.bottom}
          onClose={closeSheet}
          onBack={sheetBack}
        >
          {(mode) =>
            mode === "search" ? (
              <UserSearchList query={query} onOpenUser={openUser} />
            ) : mode === "messages" ? (
              <MessagesPage
                chatUser={chatUser}
                onOpenChat={setChatUser}
                onOpenProfile={openProfileFromChat}
                onBack={() => setChatUser(null)}
              />
            ) : mode === "notifications" ? (
              <NotificationList
                notifications={notifications}
                isLoading={notificationsLoading}
                error={notificationsError}
                remove={removeNotification}
                clearAll={clearNotifications}
                reload={reloadNotifications}
                freshIds={freshIds}
                onOpenUser={openUserFromNotification}
              />
            ) : (
              <FeedFilterPanel
                filters={filters}
                onChange={setFilters}
                matchCount={isRefreshing ? undefined : posts.length}
              />
            )
          }
        </HomeDropSheet>

        <HomeSearchPanel
          ref={inputRef}
          topInset={insets.top}
          query={query}
          onChangeQuery={setQuery}
          onFocusSearch={openSearch}
          onPressMessages={pressMessages}
          onPressFilter={pressFilter}
          onPressNotifications={pressNotifications}
          open={sheet}
          unreadMessages={unreadMessages}
          hasFilters={hasFilters}
          unread={unread}
        />

        {/* ONE dialog for the whole list, outside the FlatList. Inside a row it
            would be unmounted the moment that row scrolled out of the window. */}
        <ReportDialog post={reporting} onClose={() => setReportingId(null)} />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Index;
