import { useEffect, useRef, useState, type RefObject } from "react";
import { Animated, Easing, Keyboard, Platform, type View } from "react-native";

/** What the keyboard animates over when the platform does not say. */
const FALLBACK_DURATION_MS = 250;

export interface KeyboardLift {
  /** Animated, so the bar travels with the keyboard rather than jumping. */
  lift: Animated.Value;
  /** Whether it is raised at all - padding below a composer can depend on it. */
  isLifted: boolean;
}

/**
 * How far a composer has to rise to clear the keyboard - shared by the comment
 * box on a post and the message box in a chat.
 *
 * Measured rather than assumed, and that is the whole point. The obvious
 * version - lift by the keyboard's height - is wrong on any platform whose
 * window already shrinks for the keyboard, because the composer has moved
 * before this runs and lifting it again sends it into the middle of the
 * screen. Whether that shrinking happens depends on the Android keyboard mode
 * and on whether the app draws edge to edge, which is not something a screen
 * should have to know. It also cannot know where its composer sits: the chat's
 * is inside a drop-down page that stops above the tab bar, not at the screen's
 * bottom edge.
 *
 * So it asks the only question that has one answer everywhere: where is the
 * composer's bottom edge, and where does the keyboard start? The difference is
 * the overlap. A window that already resized reports no overlap and nothing
 * moves.
 *
 * The events differ deliberately: iOS fires `Will` before the frame animates,
 * so the lift rides the same animation instead of snapping in after it, while
 * Android only ever fires `did` - by which point any resize has happened,
 * which is exactly what makes the measurement come out at zero there.
 *
 * IDEMPOTENT ACROSS REPEATED SHOWS. iOS fires a second show, with no hide in
 * between, whenever the keyboard changes height - the suggestion bar appearing,
 * a switch to the emoji keyboard. The composer is already raised by then, so
 * measuring it as-is would find no overlap and drop it behind the keys. The
 * current lift is added back first, so every measurement is of where the
 * composer would rest - the correction ReportDialog makes for the same reason.
 *
 * Apply `lift` as marginBottom, not as a transform: margin SHORTENS the list
 * above the composer, so the newest comment or message stays in view, where a
 * transform would slide the bar over it.
 *
 * @param composer - the view whose bottom edge must clear the keyboard
 * @param gap - breathing room above the keys, added only when there is overlap
 */
export const useKeyboardLift = (
  composer: RefObject<View | null>,
  gap = 32,
): KeyboardLift => {
  const lift = useRef(new Animated.Value(0)).current;
  const target = useRef(0);
  const [isLifted, setIsLifted] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    /**
     * Driven in JS rather than natively, which is forced: marginBottom is a
     * layout property, and the native driver only handles opacity and
     * transforms.
     */
    const animate = (toValue: number, duration: number) => {
      target.current = toValue;
      Animated.timing(lift, {
        toValue,
        // The platform's own keyboard duration where it offers one, so the bar
        // and the keys move as one thing instead of racing.
        duration: duration || FALLBACK_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };

    const shown = Keyboard.addListener(showEvent, (event) => {
      const keyboardTop = event.endCoordinates.screenY;

      composer.current?.measureInWindow((_x, y, _width, height) => {
        // Where the composer's bottom would be with no lift - see IDEMPOTENT.
        const restingBottom = y + height + target.current;
        const overlap = restingBottom - keyboardTop;
        const next = overlap > 0 ? overlap + gap : 0;

        setIsLifted(next > 0);
        animate(next, event.duration);
      });
    });

    const hidden = Keyboard.addListener(hideEvent, (event) => {
      setIsLifted(false);
      animate(0, event.duration);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [composer, lift, gap]);

  return { lift, isLifted };
};
