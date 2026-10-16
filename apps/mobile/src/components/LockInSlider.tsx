import { useEffect, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Text, View, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, useReducedMotion, haptics, LOCK_IN_THUMB_SIZE } from "@theme";

interface LockInSliderProps {
  /** The thumb reached the end: the session is on its way. */
  onLockIn: () => void;
  /** Starting is not possible right now - a start already in flight. */
  disabled?: boolean;
  /** Bump to send the thumb home - after a countdown is called off. */
  resetKey?: number;
}

/** Of the way across, where letting go commits rather than springs back. */
const COMMIT_AT = 0.85;

/** The thumb's inset from the track's edge. */
const TRACK_PADDING = 6;

/**
 * Starting a session as a small act of commitment: drag the big glowing Start
 * button along its track to lock in.
 *
 * A slide rather than a tap because a tap is how you start anything; a slide
 * is how you mean it. It also cannot happen by accident from a pocket or a
 * stray thumb, which matters for something that starts a clock and a score.
 *
 * Felt as well as seen: a tick at each quarter of the way, a thud on locking
 * in. Let go short of the end and it springs home. A tap on its own nudges the
 * thumb a little way along and back - the gesture explaining itself - and a
 * screen reader's double tap starts straight away, since a drag is not
 * something it can do.
 *
 * Built on PanResponder and Animated for RatingSheet's reason: one axis, one
 * threshold, no need for a gesture library.
 */
const LockInSlider = ({ onLockIn, disabled = false, resetKey = 0 }: LockInSliderProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const reducedMotion = useReducedMotion();

  const [width, setWidth] = useState(0);
  const [hinting, setHinting] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  // The handlers are made once, so everything they read lives in refs.
  const maxRef = useRef(0);
  maxRef.current = Math.max(0, width - LOCK_IN_THUMB_SIZE - TRACK_PADDING * 2);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onLockInRef = useRef(onLockIn);
  onLockInRef.current = onLockIn;
  const quarterRef = useRef(0);

  const springHome = () => {
    quarterRef.current = 0;
    Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 10, speed: 14 }).start();
  };

  useEffect(() => {
    x.setValue(0);
    quarterRef.current = 0;
  }, [resetKey, x]);

  // The thumb breathes, so it reads as something to take hold of.
  useEffect(() => {
    if (reducedMotion || disabled) {
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(glow, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, disabled, glow]);

  const nudge = () => {
    setHinting(true);
    haptics.tap();
    Animated.sequence([
      Animated.timing(x, {
        toValue: Math.min(36, maxRef.current),
        duration: 160,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 12, speed: 12 }),
    ]).start();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: (_, g) => !disabledRef.current && Math.abs(g.dx) > 4,
      // A screen that scrolls must not take the drag away half-way along.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        x.stopAnimation();
        quarterRef.current = 0;
      },
      onPanResponderMove: (_, g) => {
        const max = maxRef.current;
        if (max <= 0) return;
        const along = Math.min(max, Math.max(0, g.dx));
        x.setValue(along);
        const quarter = Math.floor((along / max) * 4);
        if (quarter !== quarterRef.current) {
          quarterRef.current = quarter;
          haptics.tick();
        }
      },
      onPanResponderRelease: (_, g) => {
        const max = maxRef.current;
        // Barely moved: a tap, which the nudge answers.
        if (Math.abs(g.dx) < 6) {
          nudge();
          return;
        }
        if (max > 0 && g.dx >= max * COMMIT_AT) {
          Animated.timing(x, {
            toValue: max,
            duration: 110,
            useNativeDriver: true,
          }).start(() => {
            haptics.thud();
            setHinting(false);
            onLockInRef.current();
          });
        } else {
          springHome();
        }
      },
      onPanResponderTerminate: springHome,
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // The words fade as the thumb covers them.
  const labelOpacity = x.interpolate({
    inputRange: [0, Math.max(1, maxRef.current * 0.6)],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const haloStyle = {
    opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
  };

  return (
    <View style={styles.lockInWrap}>
      <View
        style={[styles.lockInTrack, disabled && styles.actionDisabled]}
        onLayout={onLayout}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Lock in and start studying"
        accessibilityHint="Slide the button to the right to start a session"
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate" && !disabled) {
            haptics.thud();
            onLockInRef.current();
          }
        }}
      >
        <Animated.View style={[styles.lockInLabelRow, { opacity: labelOpacity }]} pointerEvents="none">
          <Text style={styles.lockInLabel}>Slide to lock in</Text>
          <Feather name="chevrons-right" size={20} color={colors.primary} />
        </Animated.View>

        <Animated.View
          style={[styles.lockInThumbWrap, { transform: [{ translateX: x }] }]}
          {...pan.panHandlers}
        >
          {reducedMotion || disabled ? null : (
            <Animated.View pointerEvents="none" style={[styles.lockInHalo, haloStyle]} />
          )}
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.lockInThumb}
          >
            <Feather name="play" size={26} color="#ffffff" style={styles.lockInThumbIcon} />
          </LinearGradient>
        </Animated.View>
      </View>

      {hinting ? (
        <Text style={styles.lockInHint} accessibilityLiveRegion="polite">
          Slide it all the way across to start
        </Text>
      ) : null}
    </View>
  );
};

export default LockInSlider;
