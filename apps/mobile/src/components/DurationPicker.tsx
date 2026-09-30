import { useEffect, useRef } from "react";
import {
  ScrollView,
  Text,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";

import {
  useStyles,
  WHEEL_ITEM_HEIGHT,
  WHEEL_ITEM_HEIGHT_COMPACT,
  WHEEL_VISIBLE_ITEMS,
  WHEEL_VISIBLE_COMPACT,
} from "@theme";

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
 *
 * `compact` shrinks it to sit inside the dial, so the length is set in the same
 * circle that then counts it down.
 */

interface WheelProps {
  values: number[];
  value: number;
  unit: string;
  compact: boolean;
  onChange: (value: number) => void;
}

const Wheel = ({ values, value, unit, compact, onChange }: WheelProps) => {
  const styles = useStyles("study");
  const ref = useRef<ScrollView>(null);

  const H = compact ? WHEEL_ITEM_HEIGHT_COMPACT : WHEEL_ITEM_HEIGHT;
  const visible = compact ? WHEEL_VISIBLE_COMPACT : WHEEL_VISIBLE_ITEMS;
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

  /**
   * The web fallback, and not optional: onMomentumScrollEnd and
   * onScrollEndDrag are TOUCH events, so a mouse wheel fires neither and the
   * value never changed. Settling after a pause covers that, and on a device
   * it simply agrees with the momentum handler a moment earlier.
   */
  const settleWhenIdle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => apply(y, true), 120);
  };

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  return (
    <View style={[styles.wheel, { height: H * visible }]}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: pad }}
        scrollEventThrottle={16}
        onScroll={settleWhenIdle}
        onMomentumScrollEnd={(e) => apply(e.nativeEvent.contentOffset.y, false)}
        onScrollEndDrag={(e) => apply(e.nativeEvent.contentOffset.y, true)}
      >
        {values.map((n) => {
          const selected = n === value;
          return (
            <View key={n} style={[styles.wheelItem, { height: H }]}>
              <Text
                style={[
                  compact ? styles.wheelNumberCompact : styles.wheelNumber,
                  !selected && styles.wheelNumberDim,
                ]}
              >
                {n}
              </Text>
              {selected ? (
                <Text style={compact ? styles.wheelUnitCompact : styles.wheelUnit}>
                  {unit}
                </Text>
              ) : null}
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
  /** Shrinks it to sit inside the dial. */
  compact?: boolean;
}

const DurationPicker = ({ seconds, onChange, compact = false }: DurationPickerProps) => {
  const styles = useStyles("study");

  const H = compact ? WHEEL_ITEM_HEIGHT_COMPACT : WHEEL_ITEM_HEIGHT;
  const visible = compact ? WHEEL_VISIBLE_COMPACT : WHEEL_VISIBLE_ITEMS;

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
        style={[
          compact ? styles.wheelLaneCompact : styles.wheelLane,
          { top: ((visible - 1) / 2) * H, height: H },
        ]}
        pointerEvents="none"
      />

      <View style={styles.pickerRow}>
        <Wheel
          values={range(13)}
          value={h}
          unit={compact ? "h" : "hours"}
          compact={compact}
          onChange={(v) => set({ h: v })}
        />
        <Wheel
          values={range(60)}
          value={m}
          unit={compact ? "m" : "min"}
          compact={compact}
          onChange={(v) => set({ m: v })}
        />
        {/* Five-second steps: nobody plans a study session to the second, and
            sixty rows of noise makes the minutes wheel harder to reach. */}
        <Wheel
          values={range(60, 5)}
          value={s}
          unit={compact ? "s" : "sec"}
          compact={compact}
          onChange={(v) => set({ s: v })}
        />
      </View>
    </View>
  );
};

export default DurationPicker;
