import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useRegisterStyles, REGISTER_CHECK_ICON_SIZE } from "@theme";
import {
  REGISTRATION_CHECK_GROUPS,
  type RegistrationCheckGroup,
  type RegistrationResults,
} from "@data";

interface RegistrationChecksProps {
  results: RegistrationResults;
  /** Which rules to show - every sign-up rule unless told otherwise. */
  groups?: RegistrationCheckGroup[];
  /** The panel's title until everything passes. */
  title?: string;
}

/** How long the bar takes to catch up with a check changing. */
const METER_DURATION_MS = 250;

/** How long the rows take to slide shut at six of six, or open again. */
const COLLAPSE_DURATION_MS = 320;

/** The gap between the bar and the rows, which collapses with them. */
const DETAIL_GAP = 14;

/** How far the rows travel up as they close, so they slide rather than crop. */
const DETAIL_SLIDE = 8;

/**
 * Whether the OS asks for reduced motion, tracked live.
 *
 * With it on, the bar and the rows snap to their new state instead of
 * animating: the same end state, reached without the movement.
 */
const useReduceMotion = (): boolean => {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduce(enabled);
      })
      .catch(() => {
        /* unsupported platform: animate as normal */
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduce;
};

/**
 * A password checklist: a progress bar over one row per rule. Sign-up shows all
 * six rules (email and password); setting a new password after a reset passes
 * `groups` to show the four password rules alone.
 *
 * The bar fills one step per passed check and only turns success green when
 * every shown check passes - the moment the screen's button stops being dimmed. At that point the rows have
 * nothing left to say, so they slide shut under the bar; if a check fails
 * again, they slide back open to show which one.
 *
 * Both animations run in JS rather than natively, which is forced: width and
 * height are layout properties, and the native driver only handles opacity and
 * transforms.
 */
const RegistrationChecks = ({
  results,
  groups = REGISTRATION_CHECK_GROUPS,
  title = "Account checks",
}: RegistrationChecksProps) => {
  const { colors } = useTheme();
  const styles = useRegisterStyles();
  const reduceMotion = useReduceMotion();

  // Counted over the checks SHOWN, not every result: on the reset screen the
  // email checks are always false and would keep the panel from completing.
  const shown = groups.flatMap((group) => group.checks);
  const passed = shown.filter((check) => results[check.key]).length;
  const total = shown.length;
  const complete = passed === total;

  // Seeded from the first render's state, so the panel opens at rest rather
  // than animating into it.
  const fill = useRef(new Animated.Value(passed / total)).current;
  const open = useRef(new Animated.Value(complete ? 0 : 1)).current;

  // The rows' natural height, measured from the inner view. Until it arrives
  // no height is imposed at all, so the first frame lays out naturally.
  const [detailHeight, setDetailHeight] = useState<number | null>(null);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: passed / total,
      duration: reduceMotion ? 0 : METER_DURATION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [fill, passed, total, reduceMotion]);

  useEffect(() => {
    Animated.timing(open, {
      toValue: complete ? 0 : 1,
      duration: reduceMotion ? 0 : COLLAPSE_DURATION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [open, complete, reduceMotion]);

  // The rows are about to disappear from the accessibility tree, so say what
  // they would have said.
  useEffect(() => {
    if (complete) {
      AccessibilityInfo.announceForAccessibility(
        `All ${total} checks passed`,
      );
    }
  }, [complete, total]);

  const measure = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height !== detailHeight) setDetailHeight(height);
  };

  const level = complete ? "done" : passed >= total / 2 ? "partial" : "low";

  return (
    <View style={[styles.checks, complete && styles.checksDone]}>
      <View style={styles.checksHead}>
        <Text style={[styles.checksTitle, complete && styles.checksTitleDone]}>
          {complete ? "All checks passed" : title}
        </Text>
        <Text style={[styles.checksCount, complete && styles.checksCountDone]}>
          {passed} of {total}
        </Text>
      </View>

      <View
        style={styles.meter}
        accessibilityRole="progressbar"
        accessibilityLabel={title}
        accessibilityValue={{ min: 0, max: total, now: passed }}
      >
        <Animated.View
          style={[
            styles.meterFill,
            level === "done"
              ? styles.meterDone
              : level === "partial"
                ? styles.meterPartial
                : styles.meterLow,
            {
              width: fill.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>

      <Animated.View
        style={[
          styles.detail,
          {
            marginTop: open.interpolate({
              inputRange: [0, 1],
              outputRange: [0, DETAIL_GAP],
            }),
            opacity: open,
          },
          detailHeight === null
            ? null
            : {
                height: open.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, detailHeight],
                }),
              },
        ]}
        // Collapsed rows are gone for assistive tech too, not merely invisible.
        accessibilityElementsHidden={complete}
        importantForAccessibility={complete ? "no-hide-descendants" : "auto"}
      >
        <Animated.View
          onLayout={measure}
          style={[
            styles.detailInner,
            {
              transform: [
                {
                  translateY: open.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-DETAIL_SLIDE, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.checks.map((check) => {
                const ok = results[check.key];
                return (
                  <View
                    key={check.key}
                    style={styles.checkRow}
                    accessible
                    accessibilityLabel={`${check.label}: ${ok ? "done" : "not yet"}`}
                  >
                    <View style={[styles.checkMark, ok && styles.checkMarkPassed]}>
                      {ok ? (
                        <Feather
                          name="check"
                          size={REGISTER_CHECK_ICON_SIZE}
                          color={colors.success}
                        />
                      ) : null}
                    </View>
                    <Text style={[styles.checkText, ok && styles.checkTextPassed]}>
                      {check.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

export default RegistrationChecks;
