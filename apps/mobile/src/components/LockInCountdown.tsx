import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";

import { useStyles, useReducedMotion, haptics } from "@theme";

interface LockInCountdownProps {
  visible: boolean;
  /** The count reached zero: start the session. */
  onDone: () => void;
  /** Called off before it finished. */
  onCancel: () => void;
}

/** How long each number holds. Long enough to read the line under it. */
const BEAT_MS = 850;

/** How long "Lock in." holds before the session begins under it. */
const GO_MS = 550;

/**
 * One line per beat - the last moment to set up, said as a nudge rather than a
 * rule, and in the order people actually reach for things.
 */
const LINES: Record<number, string> = {
  3: "Phone face down helps your score",
  2: "Water, notes, one tab open",
  1: "Here we go",
  0: "",
};

/**
 * The three seconds between locking in and the clock starting: a full-screen
 * 3, 2, 1 with a tap of haptics on each, then "Lock in." and the session.
 *
 * It gives starting a beat of ceremony - the difference between a timer and a
 * ritual - and a last way out: "Not yet" calls it off before anything is
 * written. Under reduced motion the numbers simply change, without the zoom.
 */
const LockInCountdown = ({ visible, onDone, onCancel }: LockInCountdownProps) => {
  const styles = useStyles("study");
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(3);
  const pop = useRef(new Animated.Value(1)).current;

  // A fresh count every time it opens.
  useEffect(() => {
    if (visible) setCount(3);
  }, [visible]);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible) return;

    if (count > 0) haptics.tap();
    else haptics.success();

    if (!reducedMotion) {
      pop.setValue(0);
      Animated.timing(pop, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }).start();
    }

    const timer = setTimeout(
      () => (count > 0 ? setCount(count - 1) : onDoneRef.current()),
      count > 0 ? BEAT_MS : GO_MS,
    );
    return () => clearTimeout(timer);
  }, [visible, count, reducedMotion, pop]);

  const numberStyle = {
    opacity: pop,
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.countdown} accessibilityViewIsModal>
        <Animated.Text
          style={[count > 0 ? styles.countdownNumber : styles.countdownGo, numberStyle]}
          accessibilityLiveRegion="assertive"
        >
          {count > 0 ? count : "Lock in."}
        </Animated.Text>
        <Text style={styles.countdownLine}>{LINES[count]}</Text>

        {count > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.countdownCancel, pressed && { opacity: 0.6 }]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Not yet - don't start"
            hitSlop={10}
          >
            <Text style={styles.countdownCancelText}>Not yet</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
};

export default LockInCountdown;
