import { useEffect, useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";

import { useStyles, WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ITEMS } from "@theme";

/**
 * An iOS-Clock-style duration picker: hours, minutes and seconds on three
 * wheels, with the selection resting in a highlighted lane.
 *
 * WHY A WHEEL AND NOT CHIPS. Presets plus a text field is three controls
 * answering one question, and the field needs a keyboard for a number the user
 * already knows. A wheel answers it in a flick, and it is the gesture this
 * audience has used since they first set an alarm.
 *
 * Built from snapping ScrollViews rather than a picker dependency: the whole
 * mechanism is snapToInterval plus rounding an offset to an index.
 *
 * ZERO IS A REAL CHOICE. 0h 0m 0s means an open-ended session, which is why
 * there is no separate "no limit" control - the wheel already expresses it.
 */

interface WheelProps {
  values: number[];
  value: number;
  unit: string;
  onChange: (value: number) => void;
}

const Wheel = ({ values, value, unit, onChange }: WheelProps) => {
  const styles = useStyles("study");
  const ref = useRef<ScrollView>(null);

  const H = WHEEL_ITEM_HEIGHT;
  const visible = WHEEL_VISIBLE_ITEMS;
  const pad = ((visible - 1) / 2) * H;

  /**
   * Put the starting value in the lane on mount.
   *
   * Not the `contentOffset` prop: react-native-web ignores it, so the wheel
   * rendered at zero while the dial read 25 minutes - the control and the
   * readout disagreeing on the very first frame.
   *
   * Mount only. Following `value` afterwards would fight the finger, since
   * every settle updates it.
   */
  useEffect(() => {
    const y = Math.max(0, values.indexOf(value)) * H;
    const id = setTimeout(() => ref.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
  }, []);

  const apply = (y: number, animateSnap: boolean) => {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(y / H)));

    /**
     * Snap the POSITION as well as the value.
     *
     * snapToInterval is touch-driven: a mouse wheel ignores it, so the list
     * came to rest between rows. The value was right and the lane was wrong -
     * the bold "6 min" sat half a row below the highlight while hours and
     * seconds sat inside it, which reads as a broken control.
     */
    const snapped = index * H;
    if (animateSnap && Math.abs(y - snapped) > 1) {
      ref.current?.scrollTo({ y: snapped, animated: true });
    }

    const next = values[index];
    if (next !== value) onChange(next);
  };

  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);

  /**
   * The web fallback, and not optional: onMomentumScrollEnd and
   * onScrollEndDrag are TOUCH events, so a mouse wheel fires neither and the
   * value never changed. Settling after a pause covers that, and on a device
   * it simply agrees with the momentum handler a moment earlier.
   */
  const armIdleSettle = (y: number) => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      // A finger resting on the wheel is not "settled". Snapping here would
      // yank the list out from under it.
      if (dragging.current) return;
      apply(y, true);
    }, 120);
  };

  const settleWhenIdle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    armIdleSettle(e.nativeEvent.contentOffset.y);

  /**
   * Finger lifted. Do NOT snap here.
   *
   * On a fast flick the release point is where the finger left the screen,
   * not where the wheel will stop. Calling scrollTo with that offset fought
   * the fling: the wheel spun on, then was dragged back to the row under the
   * finger at release (20 min, flick, wheel spins past 0, lands on 15).
   *
   * Instead, re-arm the idle settle from here. If a fling follows, its scroll
   * events keep pushing the timer back and onMomentumScrollEnd decides the
   * value. If the release was slow and nothing moves, the timer settles it.
   */
  const onDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    armIdleSettle(e.nativeEvent.contentOffset.y);
  };

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  return (
    <View style={[styles.wheel, { height: H * visible }]}>
      {/*
        nestedScrollEnabled: the wheel sits inside the Study screen's
        ScrollView. On Android the outer list takes every vertical drag
        unless the inner one opts in, so the page moved and the wheel never
        did. iOS ignores the prop and already behaved.
      */}
      <ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: pad }}
        scrollEventThrottle={16}
        onScroll={settleWhenIdle}
        onMomentumScrollEnd={(e) => apply(e.nativeEvent.contentOffset.y, false)}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onScrollEndDrag={onDragEnd}
      >
        {values.map((n) => {
          const selected = n === value;
          return (
            <View key={n} style={[styles.wheelItem, { height: H }]}>
              <Text
                style={[styles.wheelNumber, !selected && styles.wheelNumberDim]}
              >
                {n}
              </Text>
              {selected ? <Text style={styles.wheelUnit}>{unit}</Text> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const range = (n: number, step = 1) =>
  Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step);

interface DurationPickerProps {
  /** Currently chosen length in seconds. 0 means open-ended. */
  seconds: number;
  onChange: (seconds: number) => void;
}

const DurationPicker = ({ seconds, onChange }: DurationPickerProps) => {
  const styles = useStyles("study");

  const H = WHEEL_ITEM_HEIGHT;
  const visible = WHEEL_VISIBLE_ITEMS;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const set = (next: { h?: number; m?: number; s?: number }) =>
    onChange((next.h ?? h) * 3600 + (next.m ?? m) * 60 + (next.s ?? s));

  return (
    <View style={styles.pickerWrap}>
      {/* One lane across all three wheels, drawn behind them - as on iOS, where
          a single highlight reads as one selection rather than three. */}
      <View
        style={[styles.wheelLane, { top: ((visible - 1) / 2) * H, height: H }]}
        pointerEvents="none"
      />

      <View style={styles.pickerRow}>
        <Wheel
          values={range(13)}
          value={h}
          unit="hours"
          onChange={(v) => set({ h: v })}
        />
        <Wheel
          values={range(60)}
          value={m}
          unit="min"
          onChange={(v) => set({ m: v })}
        />
        {/* Five-second steps: nobody plans a study session to the second, and
            sixty rows of noise makes the minutes wheel harder to reach. */}
        <Wheel
          values={range(60, 5)}
          value={s}
          unit="sec"
          onChange={(v) => set({ s: v })}
        />
      </View>
    </View>
  );
};

export default DurationPicker;
