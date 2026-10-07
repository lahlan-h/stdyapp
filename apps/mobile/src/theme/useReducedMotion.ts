import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Whether the person has asked their phone for less motion.
 *
 * Read once on mount and then followed, so flipping the setting with the app
 * open takes effect without a restart. Starts false: the answer is async, and
 * the first frame is a resting state either way - nothing animates until
 * something is opened.
 *
 * Animations here do not disappear when this is true, they finish instantly.
 * The page still opens and closes; it just stops sliding to get there.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
};
