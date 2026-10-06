import { forwardRef, useEffect, useRef } from "react";
import { View, TextInput, Pressable, Animated, Easing } from "react-native";
import { BlurView } from "expo-blur";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useReducedMotion,
  HOME_SEARCH_ICON_SIZE,
} from "@theme";

/** Which drop-down page is open, if any. */
export type HomeSheetMode = "search" | "filter";

/** How strongly the open filter button is washed in primary. */
const FILTER_TINT_OPACITY = 0.14;
const TINT_MS = 150;

interface HomeSearchPanelProps {
  /** The status-bar inset. The panel draws behind it, so its blur runs to the top edge. */
  topInset: number;
  query: string;
  onChangeQuery: (query: string) => void;
  /** Focusing the box is what opens search - there is no separate button. */
  onFocusSearch: () => void;
  onPressFilter: () => void;
  open: HomeSheetMode | null;
  /** Whether any non-default filter is on - drives the dot. */
  hasFilters: boolean;
}

/**
 * The bar pinned over the top of the feed: user search, and the feed filter.
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
    { topInset, query, onChangeQuery, onFocusSearch, onPressFilter, open, hasFilters },
    inputRef,
  ) => {
    const { colors, isDarkMode } = useTheme();
    const styles = useStyles("homeSearch");
    const reducedMotion = useReducedMotion();

    const filterOpen = open === "filter";

    // The wash fades rather than snapping, so the button visibly "lights up" as
    // the page it controls starts to drop.
    const tint = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      Animated.timing(tint, {
        toValue: filterOpen ? FILTER_TINT_OPACITY : 0,
        duration: reducedMotion ? 0 : TINT_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, [filterOpen, reducedMotion, tint]);

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
              placeholder="Search for a user..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search for a user"
            />
          </View>

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
        </View>
      </View>
    );
  },
);

HomeSearchPanel.displayName = "HomeSearchPanel";

export default HomeSearchPanel;
