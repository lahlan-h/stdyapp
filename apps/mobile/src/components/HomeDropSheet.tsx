import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  PanResponder,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  useReducedMotion,
  SHEET_CLOSE_ICON_SIZE,
} from "@theme";

import type { HomeSheetMode } from "./HomeSearchPanel";

/** Down is slower than up, as everywhere in this app: arriving is the part to watch. */
const OPEN_MS = 320;
const CLOSE_MS = 220;
const SWAP_MS = 160;
/** How far new content drops as it fades in when switching pages. */
const SWAP_DROP = 6;
/** The arrow's nudge: two small lifts once the page has landed. */
const NUDGE_LIFT = 5;
const NUDGE_DELAY_MS = 450;
/** An upward drag on the footer past this many points closes the page. */
const SWIPE_CLOSE = 30;

interface HomeDropSheetProps {
  mode: HomeSheetMode | null;
  /** Where the page hangs from: the pinned panel's bottom edge. */
  top: number;
  /** Where it stops: the tab bar's VISIBLE top edge, inset included. */
  bottom: number;
  onClose: () => void;
  /** The page's content for a mode. Called with the last mode while closing. */
  children: (mode: HomeSheetMode) => ReactNode;
}

/**
 * The page that drops down from under the search panel.
 *
 * It hangs between the panel and the tab bar and slides down from behind the
 * panel's edge - clipped there, so it seems to come out of the panel rather
 * than fall from the top of the screen. The panel and the tab bar stay live on
 * either side of it: the search box has to keep its keyboard, the filter button
 * has to be able to close its own page, and Home has to stay a tap away.
 *
 * The mount trails `mode` the way ReportDialog's does, so the page can finish
 * sliding away before it is removed. Switching between search and filter while
 * open does NOT re-drop the page: it stays put and only its contents cross-fade.
 */
const HomeDropSheet = ({ mode, top, bottom, onClose, children }: HomeDropSheetProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();

  const height = Math.max(0, windowHeight - top - bottom);
  const isOpen = mode !== null;

  // The page keeps drawing the last mode while it slides away, so its contents
  // do not blank out mid-exit.
  const lastMode = useRef<HomeSheetMode>("search");
  if (mode) lastMode.current = mode;
  const shownMode = mode ?? lastMode.current;

  const [isMounted, setIsMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(1)).current;
  const nudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) setIsMounted(true);
  }, [isOpen]);

  // Open and close.
  useEffect(() => {
    if (!isMounted) return;

    if (isOpen) {
      const open = Animated.timing(progress, {
        toValue: 1,
        duration: reducedMotion ? 0 : OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      open.start(({ finished }) => {
        if (!finished || reducedMotion) return;
        // Points at the way out twice, then rests - a hint, not a fidget. Built
        // fresh per lift: one animation object started twice in a sequence
        // does not reliably run the second time.
        const lift = () =>
          Animated.sequence([
            Animated.timing(nudge, {
              toValue: -NUDGE_LIFT,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(nudge, {
              toValue: 0,
              duration: 220,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]);
        Animated.sequence([
          Animated.delay(NUDGE_DELAY_MS - OPEN_MS),
          lift(),
          lift(),
        ]).start();
      });
      return () => open.stop();
    }

    const close = Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    // `finished` is load-bearing, as in ReportDialog: reopening mid-exit
    // interrupts this, and an unguarded callback would unmount the page that
    // just reopened.
    close.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
        nudge.setValue(0);
      }
    });
    return () => close.stop();
  }, [isOpen, isMounted, reducedMotion, progress, nudge]);

  // Search <-> filter while open: fade the new contents in from a little above.
  const previousMode = useRef<HomeSheetMode | null>(mode);
  useEffect(() => {
    const was = previousMode.current;
    previousMode.current = mode;
    if (!was || !mode || was === mode) return;

    content.setValue(0);
    Animated.timing(content, {
      toValue: 1,
      duration: reducedMotion ? 0 : SWAP_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [mode, reducedMotion, content]);

  // Android's back button closes the page before it leaves the screen.
  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, onClose]);

  // A swipe up on the footer closes the page, matching where the arrow points.
  // Claimed only for a clearly vertical drag, so a tap still reaches the button.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, { dy, dx }) =>
          dy < -8 && Math.abs(dy) > Math.abs(dx),
        onPanResponderRelease: (_event, { dy }) => {
          if (dy < -SWIPE_CLOSE) onCloseRef.current();
        },
      }),
    [],
  );

  if (!isMounted) return null;

  return (
    <View
      style={[styles.sheetClip, { top, bottom }]}
      // While closing the page is still drawn, but it must not catch the tap
      // that comes straight after closing it.
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <Animated.View style={[styles.scrim, { opacity: progress }]} />

      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-height, 0],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient colors={colors.gradients.background} style={styles.sheetFill}>
          <Animated.View
            style={[
              styles.sheetBody,
              {
                opacity: content,
                transform: [
                  {
                    translateY: content.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SWAP_DROP, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {children(shownMode)}
          </Animated.View>

          <View style={styles.sheetFoot} {...swipe.panHandlers}>
            <Animated.View style={{ transform: [{ translateY: nudge }] }}>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={shownMode === "search" ? "Close search" : "Close filters"}
                style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
              >
                <Feather name="chevron-up" size={SHEET_CLOSE_ICON_SIZE} color={colors.text} />
              </Pressable>
            </Animated.View>
            <Text style={styles.closeHint}>Close</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

export default HomeDropSheet;
