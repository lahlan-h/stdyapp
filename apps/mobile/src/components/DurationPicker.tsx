import { useEffect, useRef } from "react";
import { ScrollView, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";

import { useStyles, WHEEL_ITEM_HEIGHT, WHEEL_VISIBLE_ITEMS } from "@theme";

/**
 * An iOS-Clock-style duration picker: three wheels for hours, minutes and
 * seconds, with the selection sitting in a highlighted lane through the middle.
 *
 * WHY A WHEEL AND NOT CHIPS. Presets plus a text field is three controls
 * answering one question, and the field needs a keyboard for a number the user
 * already knows. One wheel answers it in a flick and is a gesture this audience
 * has used since they first set an alarm.
 *
 * Built from ScrollViews with snapping rather than a picker dependency: the
 * whole mechanism is snapToInterval plus rounding the offset to an index, and
 * it behaves identically on web, which is where this gets tested.
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

/** Empty rows above and below, so the first and last value can reach centre. */
const PAD_ITEMS = (WHEEL_VISIBLE_ITEMS - 1) / 2;

const Wheel = ({ values, value, unit, onChange }: WheelProps) => {
  const styles = useStyles("study");
  const ref = useRef<ScrollView>(null);

  /**
   * Scroll the starting value into the lane on mount.
   *
   * Not the `contentOffset` prop: react-native-web ignores it, so the wheel
   * rendered at the top while the dial showed 25 minutes - the control and the
   * readout disagreeing on the first thing the user sees.
   *
   * Mount only, deliberately. Following `value` afterwards would fight the
   * finger, since every settle updates it.
   */
  useEffect(() => {
    const y = Math.max(0, values.indexOf(value)) * WHEEL_ITEM_HEIGHT;
    // After layout, or there is nothing to scroll yet.
    const id = setTimeout(() => ref.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
  }, []);

  /**
   * The index is read on SETTLE, not on every frame.
   *
   * onScroll would fire the change dozens of times per flick, and each one
   * re-renders the dial behind the picker. Snapping guarantees the resting
   * offset is a whole number of rows, so rounding it is exact rather than
   * approximate.
   */
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
    const next = values[Math.max(0, Math.min(values.length - 1, index))];
    if (next !== value) onChange(next);
  };

  /**
   * The web fallback, and it is not optional.
   *
   * onMomentumScrollEnd and onScrollEndDrag are TOUCH events: a mouse wheel
   * fires neither, so on web the wheel span and the value never changed - it
   * looked broken while being perfectly wired. Settling after a short pause in
   * scrolling covers that, and on a device it simply agrees with the momentum
   * handler a moment earlier.
   */
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleWhenIdle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      const index = Math.round(y / WHEEL_ITEM_HEIGHT);
      const next = values[Math.max(0, Math.min(values.length - 1, index))];
      if (next !== value) onChange(next);
    }, 120);
  };

  useEffect(() => () => {
    if (idle.current) clearTimeout(idle.current);
  }, []);

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD_ITEMS * WHEEL_ITEM_HEIGHT }}
        scrollEventThrottle={16}
        onScroll={settleWhenIdle}
        onMomentumScrollEnd={settle}
        // Fires for a slow drag released without flick, which produces no
        // momentum event at all - without this the value silently sticks.
        onScrollEndDrag={settle}
      >
        {values.map((n) => {
          const selected = n === value;
          return (
            <View key={n} style={styles.wheelItem}>
              <Text style={[styles.wheelNumber, !selected && styles.wheelNumberDim]}>
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

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const set = (next: { h?: number; m?: number; s?: number }) =>
    onChange(
      (next.h ?? h) * 3600 + (next.m ?? m) * 60 + (next.s ?? s),
    );

  return (
    <View style={styles.pickerWrap}>
      {/* The lane the selection sits in, drawn behind all three wheels. */}
      <View style={styles.wheelLane} pointerEvents="none" />

      <View style={styles.pickerRow}>
        <Wheel values={range(13)} value={h} unit="hours" onChange={(v) => set({ h: v })} />
        <Wheel values={range(60)} value={m} unit="min" onChange={(v) => set({ m: v })} />
        {/* Five-second steps: nobody plans a study session to the second, and
            sixty rows of noise makes the minutes wheel harder to reach. */}
        <Wheel values={range(60, 5)} value={s} unit="sec" onChange={(v) => set({ s: v })} />
      </View>
    </View>
  );
};

export default DurationPicker;
