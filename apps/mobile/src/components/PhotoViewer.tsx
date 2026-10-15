import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, PHOTO_VIEWER_ICON_SIZE } from "@theme";
import { usePhotoSave, type PhotoSaveStatus } from "@data";

interface PhotoViewerProps {
  /** A post's photos, in order. */
  photos: { url: string }[];
  /** Which one to open on - the one that was tapped. */
  initialIndex?: number;
  onClose: () => void;
  /** What the photo is of, for a screen reader - the post's title. */
  label?: string;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** How far a drag has to travel, at rest zoom, to close the viewer. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1000;
/** How far a sideways drag has to travel to move to the next photo. */
const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 800;
/** How far the first and last photo give when dragged past the end. */
const EDGE_RESISTANCE = 0.3;
/** How long "Saved to Photos" stays up. */
const STATUS_MS = 2500;

/** Which way a drag at rest zoom is going, decided by its first movement. */
const AXIS_NONE = 0;
const AXIS_SIDEWAYS = 1;
const AXIS_VERTICAL = 2;

const statusText = (status: PhotoSaveStatus, error?: string): string | null => {
  switch (status) {
    case "saved":
      return Platform.OS === "web" ? "Downloaded" : "Saved to Photos";
    case "opened":
      return Platform.OS === "web"
        ? "Opened in a new tab - save it from there"
        : "Press and hold the photo to save it";
    case "error":
      return error ?? null;
    default:
      return null;
  }
};

/**
 * A post's photos, full screen - the Facebook / X lightbox.
 *
 * Pinch to zoom (up to 4x), double-tap to zoom in or back out, drag to move
 * around while zoomed. At rest zoom, a drag's first movement decides what it
 * does: sideways moves to the next or previous photo, up or down closes the
 * viewer, the photo following the finger while the black behind it fades. The
 * download button saves the photo on screen to the phone's library, or
 * downloads it on web - see usePhotoSave.
 *
 * Rendered only while open, so every gesture starts from rest zoom each time.
 * Its own GestureHandlerRootView, because a Modal is a separate native window
 * on Android and the app's root does not reach into it.
 */
const PhotoViewer = ({ photos, initialIndex = 0, onClose, label }: PhotoViewerProps) => {
  const { colors } = useTheme();
  const styles = useStyles("photoViewer");
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { save, status, error, reset } = usePhotoSave();

  const [index, setIndex] = useState(
    Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0)),
  );
  const last = photos.length - 1;
  const uri = photos[index]?.url;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const axis = useSharedValue(AXIS_NONE);

  // A finished save says so briefly, then gets out of the way.
  useEffect(() => {
    if (status === "idle" || status === "saving") return;
    const timer = setTimeout(reset, STATUS_MS);
    return () => clearTimeout(timer);
  }, [status, reset]);

  const resetZoom = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  /**
   * Shows another photo, from rest: the previous one slid out of view, so the
   * new one simply takes its place, unzoomed.
   */
  const showPhoto = useCallback(
    (next: number) => {
      setIndex(next);
      x.value = 0;
      y.value = 0;
      scale.value = 1;
      savedScale.value = 1;
      savedX.value = 0;
      savedY.value = 0;
    },
    [x, y, scale, savedScale, savedX, savedY],
  );

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      // A little below 1 is allowed while pinching, so it feels elastic; it
      // springs back to 1 on release.
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1) resetZoom();
      else savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      axis.value = AXIS_NONE;
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        // Zoomed: look around the photo.
        x.value = savedX.value + event.translationX;
        y.value = savedY.value + event.translationY;
        return;
      }

      // At rest: the first movement decides, and the drag keeps to it - a
      // sideways swipe that wanders down must not start closing the viewer.
      if (axis.value === AXIS_NONE) {
        axis.value =
          Math.abs(event.translationX) > Math.abs(event.translationY)
            ? AXIS_SIDEWAYS
            : AXIS_VERTICAL;
      }

      if (axis.value === AXIS_SIDEWAYS) {
        const pastStart = index === 0 && event.translationX > 0;
        const pastEnd = index === last && event.translationX < 0;
        x.value = event.translationX * (pastStart || pastEnd ? EDGE_RESISTANCE : 1);
      } else {
        y.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        savedX.value = x.value;
        savedY.value = y.value;
        return;
      }

      if (axis.value === AXIS_SIDEWAYS) {
        const swiped =
          Math.abs(event.translationX) > SWIPE_DISTANCE ||
          Math.abs(event.velocityX) > SWIPE_VELOCITY;
        const direction = event.translationX < 0 ? 1 : -1;
        const next = index + direction;
        if (swiped && next >= 0 && next <= last) {
          // Out the way the finger was going, then the next photo in its place.
          x.value = withTiming(-direction * screenWidth, { duration: 160 }, (finished) => {
            if (finished) scheduleOnRN(showPhoto, next);
          });
        } else {
          x.value = withTiming(0);
        }
        return;
      }

      const far = Math.abs(event.translationY) > DISMISS_DISTANCE;
      const fast = Math.abs(event.velocityY) > DISMISS_VELOCITY;
      if (far || fast) scheduleOnRN(onClose);
      else y.value = withTiming(0);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  // Fades as a close-drag travels, so letting go past the line reads as
  // "dropping" the photo rather than it vanishing. A sideways swipe leaves y
  // at 0, so moving between photos never fades it.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      scale.value > 1
        ? 1
        : interpolate(Math.abs(y.value), [0, DISMISS_DISTANCE * 3], [1, 0.3], "clamp"),
  }));

  if (!uri) return null;

  const message = statusText(status, error);
  const saving = status === "saving";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />

        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.stage, photoStyle]}>
            <Image
              source={{ uri }}
              style={styles.photo}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={label ? `Photo: ${label}` : "Photo"}
            />
          </Animated.View>
        </GestureDetector>

        <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.control, pressed && { opacity: 0.7 }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Feather name="x" size={PHOTO_VIEWER_ICON_SIZE} color={colors.lightbox.text} />
          </Pressable>

          {photos.length > 1 ? (
            <Text style={styles.counter} accessibilityLiveRegion="polite">
              {index + 1} / {photos.length}
            </Text>
          ) : null}

          <Pressable
            onPress={() => void save(uri)}
            disabled={saving}
            style={({ pressed }) => [
              styles.control,
              saving && styles.controlBusy,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={photos.length > 1 ? `Save photo ${index + 1}` : "Save photo"}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator color={colors.lightbox.text} />
            ) : (
              <Feather name="download" size={PHOTO_VIEWER_ICON_SIZE} color={colors.lightbox.text} />
            )}
          </Pressable>
        </View>

        {message ? (
          <View
            style={[styles.status, { bottom: insets.bottom + 24 }]}
            accessibilityLiveRegion="polite"
            accessibilityRole={status === "error" ? "alert" : undefined}
          >
            <Text style={styles.statusText}>{message}</Text>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
};

export default PhotoViewer;
