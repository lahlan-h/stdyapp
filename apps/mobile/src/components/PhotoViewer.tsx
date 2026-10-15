import { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
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
  uri: string;
  onClose: () => void;
  /** What the photo is of, for a screen reader - the post's title. */
  label?: string;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/** How far a drag has to travel, at rest zoom, to close the viewer. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1000;
/** How long "Saved to Photos" stays up. */
const STATUS_MS = 2500;

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
 * A post's photo, full screen - the Facebook / X lightbox.
 *
 * Pinch to zoom (up to 4x), double-tap to zoom in or back out, drag to move
 * around while zoomed. At rest zoom, dragging up or down closes it, the photo
 * following the finger while the black behind it fades. The download button
 * saves the photo to the phone's library, or downloads it on web - see
 * usePhotoSave.
 *
 * Rendered only while open, so every gesture starts from rest zoom each time.
 * Its own GestureHandlerRootView, because a Modal is a separate native window
 * on Android and the app's root does not reach into it.
 */
const PhotoViewer = ({ uri, onClose, label }: PhotoViewerProps) => {
  const { colors } = useTheme();
  const styles = useStyles("photoViewer");
  const insets = useSafeAreaInsets();
  const { save, status, error, reset } = usePhotoSave();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

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
    .onUpdate((event) => {
      if (scale.value > 1) {
        // Zoomed: look around the photo.
        x.value = savedX.value + event.translationX;
        y.value = savedY.value + event.translationY;
      } else {
        // At rest: a drag to close. Vertical only - sideways means nothing here.
        y.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        savedX.value = x.value;
        savedY.value = y.value;
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
  // "dropping" the photo rather than it vanishing.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      scale.value > 1
        ? 1
        : interpolate(Math.abs(y.value), [0, DISMISS_DISTANCE * 3], [1, 0.3], "clamp"),
  }));

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
            accessibilityLabel="Save photo"
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
