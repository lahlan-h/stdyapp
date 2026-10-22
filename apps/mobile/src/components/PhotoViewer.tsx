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
  type SharedValue,
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
/**
 * How far a sideways drag has to travel - as a share of the screen - or how
 * fast it has to be flicked, to settle on the next photo rather than spring
 * back to this one.
 */
const SWIPE_SHARE = 0.25;
const SWIPE_VELOCITY = 500;
/** How far the first and last photo give when dragged past the end. */
const EDGE_RESISTANCE = 0.3;
/** How long a photo takes to settle into place after a swipe. */
const SETTLE_MS = 220;
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

interface ViewerPageProps {
  uri: string;
  position: number;
  width: number;
  /** Which photo is centred - only that one takes the zoom. */
  page: SharedValue<number>;
  scale: SharedValue<number>;
  zoomX: SharedValue<number>;
  zoomY: SharedValue<number>;
  label: string;
}

/**
 * One photo in the strip, a screen wide. Zoom applies only while it is the
 * centred one, so pinching never moves a neighbour waiting off-screen.
 */
const ViewerPage = ({ uri, position, width, page, scale, zoomX, zoomY, label }: ViewerPageProps) => {
  const styles = useStyles("photoViewer");

  const zoomStyle = useAnimatedStyle(() => {
    const active = page.value === position;
    return {
      transform: [
        { translateX: active ? zoomX.value : 0 },
        { translateY: active ? zoomY.value : 0 },
        { scale: active ? scale.value : 1 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.page, { width }, zoomStyle]}>
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={label}
      />
    </Animated.View>
  );
};

/**
 * A post's photos, full screen - the Facebook / X lightbox.
 *
 * SWIPE sideways to move between photos: they sit side by side in one strip,
 * so the next photo slides in with the finger and letting go settles on it -
 * or springs back, if the drag was short and slow. The strip is moved by one
 * shared value on the UI thread, never by a React re-render, which is what
 * keeps a swipe from flickering.
 *
 * Pinch to zoom (up to 4x), double-tap to zoom in or back out, drag to look
 * around while zoomed. At rest zoom a drag's first movement decides what it
 * does: sideways swipes, up or down closes the viewer - the photo following
 * the finger while the black behind it fades. On web the arrow keys switch
 * photos too, and Esc closes.
 *
 * The download button saves the photo on screen - see usePhotoSave.
 *
 * Rendered only while open, so every gesture starts from rest. Its own
 * GestureHandlerRootView, because a Modal is a separate native window on
 * Android and the app's root does not reach into it.
 */
const PhotoViewer = ({ photos, initialIndex = 0, onClose, label }: PhotoViewerProps) => {
  const { colors } = useTheme();
  const styles = useStyles("photoViewer");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { save, status, error, reset } = usePhotoSave();

  const last = photos.length - 1;
  const start = Math.min(Math.max(initialIndex, 0), Math.max(last, 0));

  // React's copy, for the counter and the save button. The strip itself
  // follows `page`, its UI-thread twin.
  const [index, setIndex] = useState(start);
  const page = useSharedValue(start);
  /** The strip's horizontal position: -page * width at rest, plus any drag. */
  const offset = useSharedValue(-start * width);
  /** A drag to close, up or down. */
  const closeY = useSharedValue(0);

  // Zoom, for the centred photo only.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const zoomX = useSharedValue(0);
  const zoomY = useSharedValue(0);
  const savedZoomX = useSharedValue(0);
  const savedZoomY = useSharedValue(0);

  const axis = useSharedValue(AXIS_NONE);

  // A finished save says so briefly, then gets out of the way.
  useEffect(() => {
    if (status === "idle" || status === "saving") return;
    const timer = setTimeout(reset, STATUS_MS);
    return () => clearTimeout(timer);
  }, [status, reset]);

  // The window can change size - a rotation, a resized browser - and the
  // strip's resting place is measured in widths.
  useEffect(() => {
    offset.value = -page.value * width;
  }, [width, offset, page]);

  const resetZoom = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    zoomX.value = withTiming(0);
    zoomY.value = withTiming(0);
    savedZoomX.value = 0;
    savedZoomY.value = 0;
  };

  /** Settles the strip on a photo - the end of a swipe, from the UI thread. */
  const settleOn = (next: number) => {
    "worklet";
    page.value = next;
    offset.value = withTiming(-next * width, { duration: SETTLE_MS });
    scale.value = 1;
    savedScale.value = 1;
    zoomX.value = 0;
    zoomY.value = 0;
    savedZoomX.value = 0;
    savedZoomY.value = 0;
    scheduleOnRN(setIndex, next);
  };

  /** The same, from the JS thread - the arrow keys on web. */
  const showPhoto = useCallback(
    (next: number) => {
      if (next < 0 || next > last) return;
      page.value = next;
      offset.value = withTiming(-next * width, { duration: SETTLE_MS });
      scale.value = 1;
      savedScale.value = 1;
      zoomX.value = 0;
      zoomY.value = 0;
      savedZoomX.value = 0;
      savedZoomY.value = 0;
      setIndex(next);
    },
    [last, width, page, offset, scale, savedScale, zoomX, zoomY, savedZoomX, savedZoomY],
  );

  // A browser has a keyboard: arrow keys move between photos and Esc closes,
  // as in Facebook's viewer. Phones have no keyboard to listen to.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") showPhoto(page.value - 1);
      else if (event.key === "ArrowRight") showPhoto(page.value + 1);
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPhoto, page, onClose]);

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
        zoomX.value = savedZoomX.value + event.translationX;
        zoomY.value = savedZoomY.value + event.translationY;
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
        const pastStart = page.value === 0 && event.translationX > 0;
        const pastEnd = page.value === last && event.translationX < 0;
        offset.value =
          -page.value * width + event.translationX * (pastStart || pastEnd ? EDGE_RESISTANCE : 1);
      } else {
        closeY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1) {
        savedZoomX.value = zoomX.value;
        savedZoomY.value = zoomY.value;
        return;
      }

      if (axis.value === AXIS_SIDEWAYS) {
        const swiped =
          Math.abs(event.translationX) > width * SWIPE_SHARE ||
          Math.abs(event.velocityX) > SWIPE_VELOCITY;
        const next = page.value + (event.translationX < 0 ? 1 : -1);
        if (swiped && next >= 0 && next <= last) {
          settleOn(next);
        } else {
          offset.value = withTiming(-page.value * width, { duration: SETTLE_MS });
        }
        return;
      }

      const far = Math.abs(event.translationY) > DISMISS_DISTANCE;
      const fast = Math.abs(event.velocityY) > DISMISS_VELOCITY;
      if (far || fast) scheduleOnRN(onClose);
      else closeY.value = withTiming(0);
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

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { translateY: closeY.value }],
  }));

  // Fades as a close-drag travels, so letting go past the line reads as
  // "dropping" the photo rather than it vanishing. A swipe leaves closeY at 0,
  // so moving between photos never fades it.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      scale.value > 1
        ? 1
        : interpolate(Math.abs(closeY.value), [0, DISMISS_DISTANCE * 3], [1, 0.3], "clamp"),
  }));

  const uri = photos[index]?.url;
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
          {/* The gesture area is the whole screen; the strip moves inside it. */}
          <View style={styles.stage}>
            <Animated.View style={[styles.strip, { width: width * photos.length }, stripStyle]}>
              {photos.map((photo, position) => (
                <ViewerPage
                  key={`${position}:${photo.url}`}
                  uri={photo.url}
                  position={position}
                  width={width}
                  page={page}
                  scale={scale}
                  zoomX={zoomX}
                  zoomY={zoomY}
                  label={
                    photos.length > 1
                      ? `Photo ${position + 1} of ${photos.length}${label ? `: ${label}` : ""}`
                      : label
                        ? `Photo: ${label}`
                        : "Photo"
                  }
                />
              ))}
            </Animated.View>
          </View>
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
