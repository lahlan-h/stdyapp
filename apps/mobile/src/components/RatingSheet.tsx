import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles } from "@theme";

/**
 * The self-rating, as a sheet over the recap rather than a screen of its own.
 *
 * A screen would make rating feel like a second task; a sheet keeps the recap
 * visible behind it and makes answering feel like part of finishing. It also
 * gives the answer a cheap way out - flick it down - which matters, because a
 * rating the user felt cornered into is worse data than no rating.
 *
 * BUILT ON PanResponder AND Animated, not a sheet library. The app has no
 * gesture or sheet dependency, and one drag axis with one dismiss threshold is
 * not worth adding two. The whole interaction is: follow the finger down,
 * ignore upward drags, and decide on release by distance or speed.
 */

const RATINGS = [1, 2, 3, 4, 5];

/** Past this much drag, release closes instead of springing back. */
const DISMISS_DISTANCE = 110;

/** A fast flick closes even when it never travelled that far. */
const DISMISS_VELOCITY = 0.6;

interface RatingSheetProps {
  visible: boolean;
  /** The rating already given, so a reopened sheet shows the current answer. */
  value: number | null;
  onRate: (value: number) => void;
  onClose: () => void;
}

const RatingSheet = ({ visible, value, onRate, onClose }: RatingSheetProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;

  const open = () =>
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 2,
      speed: 14,
    }).start();

  const close = () =>
    Animated.timing(translateY, {
      toValue: height,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });

  useEffect(() => {
    if (visible) {
      translateY.setValue(height);
      open();
    }
    // `height` is in the deps because a rotation mid-sheet would otherwise
    // animate towards a stale offscreen position.
  }, [visible, height]);

  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only once it is clearly a downward drag, so a tap on
      // a rating button is never swallowed by the sheet.
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        // Downward only. Letting it follow upward drags would lift the sheet
        // off the bottom of the screen and expose the backdrop beneath it.
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) close();
        else open();
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      {/* Tapping the dimmed area behind is the other way out. */}
      <Pressable
        style={styles.sheetBackdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY }] },
        ]}
        {...pan.panHandlers}
      >
        <View style={styles.sheetHandle} />

        <View style={styles.sheetIcon}>
          <Feather name="cpu" size={26} color={colors.primary} />
        </View>

        <Text style={styles.sheetTitle}>How focused{"\n"}did you feel?</Text>
        <Text style={styles.sheetLabel}>Your rating</Text>

        <View style={styles.ratingRow}>
          {RATINGS.map((n) => {
            const selected = value === n;
            return (
              <Pressable
                key={n}
                style={[styles.ratingButton, selected && styles.ratingButtonSelected]}
                onPress={() => onRate(n)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${n} out of 5`}
              >
                <Text
                  style={[styles.ratingText, selected && styles.ratingTextSelected]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sheetHint}>Helps stdy learn your baseline.</Text>

        <Pressable
          style={[styles.action, value === null && styles.actionDisabled]}
          disabled={value === null}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Submit rating"
        >
          <Text style={styles.actionText}>Submit</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export default RatingSheet;
