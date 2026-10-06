import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, Animated, Easing } from "react-native";
import { BlurView } from "expo-blur";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  useTheme,
  useStyles,
  useReducedMotion,
  HOME_SEARCH_ICON_SIZE,
} from "@theme";

/** Which drop-down page is open, if any. */
export type HomeSheetMode = "search" | "messages" | "filter" | "notifications";

/** How strongly an open button is washed in primary. */
const ACTIVE_TINT_OPACITY = 0.14;
const TINT_MS = 150;

/** Past this the counter stops counting: "9+" is all a glance needs. */
const BADGE_MAX = 9;

interface HomeSearchPanelProps {
  /** The status-bar inset. The panel draws behind it, so its blur runs to the top edge. */
  topInset: number;
  query: string;
  onChangeQuery: (query: string) => void;
  /** Focusing the box is what opens search - there is no separate button. */
  onFocusSearch: () => void;
  onPressMessages: () => void;
  onPressFilter: () => void;
  onPressNotifications: () => void;
  open: HomeSheetMode | null;
  /** People with unread messages - drives the messages counter. */
  unreadMessages: number;
  /** Whether any non-default filter is on - drives the dot. */
  hasFilters: boolean;
  /** Unread notifications - drives the notifications counter. */
  unread: number;
}

/**
 * The primary wash on an open button, faded rather than snapped, so the button
 * visibly "lights up" as the page it controls starts to drop.
 */
const useActiveTint = (isOpen: boolean, reducedMotion: boolean) => {
  const tint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(tint, {
      toValue: isOpen ? ACTIVE_TINT_OPACITY : 0,
      duration: reducedMotion ? 0 : TINT_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isOpen, reducedMotion, tint]);
  return tint;
};

/**
 * The counter's scale, which tells three different stories:
 *   - 0 to some: a spring in from nothing - something has arrived;
 *   - up from some: a quick pop past full size and back - something MORE has
 *     arrived, which a number silently ticking over would not say;
 *   - down to 0: a shrink away - all caught up.
 * A count that merely goes down (one read elsewhere) just changes, without a
 * flourish: that is not news.
 */
const useBadgeScale = (unread: number, reducedMotion: boolean) => {
  const scale = useRef(new Animated.Value(unread > 0 ? 1 : 0)).current;
  const previous = useRef(unread);

  useEffect(() => {
    const was = previous.current;
    previous.current = unread;
    if (was === unread) return;

    if (reducedMotion) {
      scale.setValue(unread > 0 ? 1 : 0);
      return;
    }
    if (unread > 0 && was === 0) {
      scale.setValue(0);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 160,
        useNativeDriver: true,
      }).start();
    } else if (unread > was) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.25,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (unread === 0) {
      Animated.timing(scale, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [unread, reducedMotion, scale]);

  return scale;
};

interface CountButtonProps {
  isOpen: boolean;
  /** What the red counter shows; 0 hides it. */
  count: number;
  onPress: () => void;
  accessibilityLabel: string;
  /** Draws the icon in the colour the button's state calls for. */
  renderIcon: (color: string) => ReactNode;
}

/**
 * A panel button with a red counter on its corner - messages and
 * notifications.
 *
 * The WRAPPER, not the button, holds the counter: the button clips its tint
 * to its corners, and would clip the counter with it. See BADGE_OVERHANG in
 * homeSearch.styles for how the wrapper makes room without moving the button.
 */
const CountButton = ({
  isOpen,
  count,
  onPress,
  accessibilityLabel,
  renderIcon,
}: CountButtonProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const reducedMotion = useReducedMotion();

  const tint = useActiveTint(isOpen, reducedMotion);
  const badgeScale = useBadgeScale(count, reducedMotion);

  // While the counter shrinks away it keeps showing the number it had,
  // rather than blanking to "0" for the length of the animation.
  const lastCount = useRef(count);
  if (count > 0) lastCount.current = count;
  const badgeLabel =
    lastCount.current > BADGE_MAX ? `${BADGE_MAX}+` : String(lastCount.current);

  return (
    <View style={styles.countWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => [
          styles.filterButton,
          isOpen && styles.filterButtonActive,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.filterTint, { opacity: tint }]} />
        {renderIcon(isOpen ? colors.primary : colors.text)}
      </Pressable>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.countBadge, { transform: [{ scale: badgeScale }] }]}
      >
        <Text style={styles.countBadgeLabel}>{badgeLabel}</Text>
      </Animated.View>
    </View>
  );
};

/**
 * The bar pinned over the top of the feed: user search, messages, the feed
 * filter, and notifications.
 *
 * Drawn the way the tab bar is - a blur over a translucent floor, edged by a
 * hairline - so the two bars read as one frame around the feed, with the cards
 * scrolling underneath both.
 *
 * It owns no state. Which page is open, what is typed and what is filtered all
 * belong to the home screen, because the drop-down page and the feed read them
 * too.
 */
const HomeSearchPanel = forwardRef<TextInput, HomeSearchPanelProps>(
  (
    {
      topInset,
      query,
      onChangeQuery,
      onFocusSearch,
      onPressMessages,
      onPressFilter,
      onPressNotifications,
      open,
      unreadMessages,
      hasFilters,
      unread,
    },
    inputRef,
  ) => {
    const { colors, isDarkMode } = useTheme();
    const styles = useStyles("homeSearch");
    const reducedMotion = useReducedMotion();

    const filterOpen = open === "filter";

    const tint = useActiveTint(filterOpen, reducedMotion);

    /**
     * The dot pops in on the first non-default filter and shrinks away on reset.
     *
     * Kept mounted at scale 0 rather than unmounted, so the exit can animate -
     * and a spring on the way in, so it reads as a status arriving rather than
     * a layout change.
     */
    const dot = useRef(new Animated.Value(hasFilters ? 1 : 0)).current;
    useEffect(() => {
      if (reducedMotion) {
        dot.setValue(hasFilters ? 1 : 0);
        return;
      }
      if (hasFilters) {
        Animated.spring(dot, {
          toValue: 1,
          friction: 5,
          tension: 160,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(dot, {
          toValue: 0,
          duration: 120,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    }, [hasFilters, reducedMotion, dot]);

    return (
      <View style={[styles.panel, { paddingTop: topInset }]}>
        <BlurView
          intensity={40}
          tint={isDarkMode ? "dark" : "light"}
          style={styles.panelSurface}
        />

        <View style={styles.panelRow}>
          <View style={[styles.searchBox, open === "search" && styles.searchBoxFocused]}>
            <Feather
              name="search"
              size={HOME_SEARCH_ICON_SIZE}
              color={open === "search" ? colors.primary : colors.textMuted}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={onChangeQuery}
              onFocus={onFocusSearch}
              // Shorter than the mockup's first "Search for a user...": with
              // four objects in the row, this is what fits a 360pt phone.
              placeholder="Search users..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search for a user"
            />
          </View>

          <CountButton
            isOpen={open === "messages"}
            count={unreadMessages}
            onPress={onPressMessages}
            accessibilityLabel={
              unreadMessages > 0
                ? `Messages, ${unreadMessages} unread ${unreadMessages === 1 ? "conversation" : "conversations"}`
                : "Messages"
            }
            renderIcon={(color) => (
              <Feather name="message-circle" size={HOME_SEARCH_ICON_SIZE} color={color} />
            )}
          />

          <Pressable
            onPress={onPressFilter}
            accessibilityRole="button"
            accessibilityLabel={hasFilters ? "Filter posts, filters on" : "Filter posts"}
            accessibilityState={{ expanded: filterOpen }}
            style={({ pressed }) => [
              styles.filterButton,
              filterOpen && styles.filterButtonActive,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.filterTint, { opacity: tint }]}
            />
            <Feather
              name="filter"
              size={HOME_SEARCH_ICON_SIZE}
              color={filterOpen ? colors.primary : colors.text}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.filterDot, { transform: [{ scale: dot }] }]}
            />
          </Pressable>

          <CountButton
            isOpen={open === "notifications"}
            count={unread}
            onPress={onPressNotifications}
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            // Ionicons, not Feather like its neighbours: Feather has no
            // lightbulb, and the outline weight matches closely.
            renderIcon={(color) => (
              <Ionicons name="bulb-outline" size={HOME_SEARCH_ICON_SIZE + 2} color={color} />
            )}
          />
        </View>
      </View>
    );
  },
);

HomeSearchPanel.displayName = "HomeSearchPanel";

export default HomeSearchPanel;
