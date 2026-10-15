import { View, Text, Pressable, ScrollView, LayoutAnimation, Platform } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, useReducedMotion, FILTER_FIELD_ICON_SIZE } from "@theme";
import {
  defaultFeedFilters,
  isDefaultFilters,
  isRangeInvalid,
  toDayKey,
  fromDayKey,
  type FeedFilters,
  type FeedDateMode,
  type FeedSort,
} from "@data";

interface FeedFilterPanelProps {
  filters: FeedFilters;
  /** Every change applies at once - there is no Apply button. */
  onChange: (filters: FeedFilters) => void;
  /** Posts the current filter matched, once known; undefined while it is being read. */
  matchCount?: number;
}

const DATE_MODES: { mode: FeedDateMode; label: string }[] = [
  { mode: "any", label: "Any time" },
  { mode: "range", label: "Range" },
  { mode: "exact", label: "Exact date" },
];

/**
 * The sort, as three rows of two rather than one list of six.
 *
 * Still ONE choice across all six: sorting by likes and by date at once has no
 * meaning, so picking a chip in any row deselects every other. The rows only
 * group the six by what they rank.
 */
const SORT_ROWS: { label: string; options: { sort: FeedSort; label: string }[] }[] = [
  {
    label: "Date",
    options: [
      { sort: "recent", label: "Most recent" },
      { sort: "oldest", label: "Least recent" },
    ],
  },
  {
    label: "Likes",
    options: [
      { sort: "most_liked", label: "Most" },
      { sort: "least_liked", label: "Least" },
    ],
  },
  {
    label: "Comments",
    options: [
      { sort: "most_commented", label: "Most" },
      { sort: "least_commented", label: "Least" },
    ],
  },
];

/** "6 Oct 2026" - the day, unambiguous in every locale's reading order. */
const formatDay = (key: string): string =>
  fromDayKey(key).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (key: string) => void;
  invalid?: boolean;
}

/**
 * One date, picked with the phone's own picker.
 *
 * Android's picker is a dialog opened imperatively, so the field is a button
 * that opens it. iOS's compact picker IS a control, so it sits inside the field
 * and opens its own calendar popover. Either way no future date can be chosen:
 * nothing has been posted there.
 */
const DateField = ({ label, value, onChange, invalid }: DateFieldProps) => {
  const { colors, isDarkMode } = useTheme();
  const styles = useStyles("homeSearch");
  const date = fromDayKey(value);
  const today = new Date();

  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value: date,
      mode: "date",
      maximumDate: today,
      onValueChange: (_event, picked) => onChange(toDayKey(picked)),
    });

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {Platform.OS === "ios" ? (
        <View style={[styles.fieldControl, invalid && styles.fieldControlInvalid]}>
          <Feather name="calendar" size={FILTER_FIELD_ICON_SIZE} color={colors.textMuted} />
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            maximumDate={today}
            themeVariant={isDarkMode ? "dark" : "light"}
            accentColor={colors.primary}
            onValueChange={(_event, picked) => onChange(toDayKey(picked))}
            accessibilityLabel={label}
          />
        </View>
      ) : (
        <Pressable
          onPress={openAndroid}
          // The web build has no native picker to open; the field still shows
          // the date, it just cannot change it there.
          disabled={Platform.OS === "web"}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${formatDay(value)}`}
          style={({ pressed }) => [
            styles.fieldControl,
            invalid && styles.fieldControlInvalid,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="calendar" size={FILTER_FIELD_ICON_SIZE} color={colors.textMuted} />
          <Text style={styles.fieldValue} numberOfLines={1}>
            {formatDay(value)}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

/**
 * The filter page: which days, and in what order.
 *
 * LIVE: every tap calls onChange, the feed behind the page re-reads, and the
 * dot on the filter button follows. There is no Apply step to forget, which is
 * why Reset is the only button and why it is red - it is the one action here
 * that throws a choice away.
 */
const FeedFilterPanel = ({ filters, onChange, matchCount }: FeedFilterPanelProps) => {
  const styles = useStyles("homeSearch");
  const reducedMotion = useReducedMotion();

  const isDefault = isDefaultFilters(filters);
  const rangeInvalid = isRangeInvalid(filters);

  const setMode = (dateMode: FeedDateMode) => {
    if (dateMode === filters.dateMode) return;
    // The date fields appear, change or go; easing that keeps the sort rows
    // below from jumping by a field's height in one frame.
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onChange({ ...filters, dateMode });
  };

  const reset = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onChange(defaultFeedFilters());
  };

  return (
    <ScrollView
      contentContainerStyle={styles.sheetContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.filterTitle} accessibilityRole="header">
        FILTER
      </Text>

      <View style={styles.filterSection}>
        <Text style={styles.sectionTitle}>Date posted</Text>
        <View
          style={styles.segmentGroup}
          accessibilityRole="radiogroup"
          accessibilityLabel="Date posted"
        >
          {DATE_MODES.map(({ mode, label }) => {
            const selected = filters.dateMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setMode(mode)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={label}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {filters.dateMode === "range" ? (
          <>
            <View style={styles.fields}>
              <DateField
                label="Start date"
                value={filters.start}
                invalid={rangeInvalid}
                onChange={(start) => onChange({ ...filters, start })}
              />
              <DateField
                label="End date"
                value={filters.end}
                invalid={rangeInvalid}
                onChange={(end) => onChange({ ...filters, end })}
              />
            </View>
            {rangeInvalid ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                Start date must be on or before the end date.
              </Text>
            ) : null}
          </>
        ) : filters.dateMode === "exact" ? (
          <View style={styles.fields}>
            <DateField
              label="Date"
              value={filters.exact}
              onChange={(exact) => onChange({ ...filters, exact })}
            />
          </View>
        ) : (
          <Text style={styles.note}>Showing posts from any date.</Text>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.sectionTitle}>Sort by</Text>
        <View style={styles.sortRows} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
          {SORT_ROWS.map((row) => (
            <View key={row.label} style={styles.sortRow}>
              <Text style={styles.sortLabel}>{row.label}</Text>
              <View style={styles.chips}>
                {row.options.map(({ sort, label }) => {
                  const selected = filters.sort === sort;
                  return (
                    <Pressable
                      key={sort}
                      onPress={() => onChange({ ...filters, sort })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${row.label}: ${label}`}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressed && !selected && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </View>

      {matchCount === 0 ? (
        <Text style={[styles.note, styles.filterNone]} accessibilityLiveRegion="polite">
          No posts match these filters.
        </Text>
      ) : null}

      <View style={styles.filterActions}>
        <Pressable
          onPress={reset}
          disabled={isDefault}
          accessibilityRole="button"
          accessibilityLabel="Reset filters"
          accessibilityState={{ disabled: isDefault }}
          style={({ pressed }) => [
            styles.resetButton,
            isDefault && styles.resetButtonDisabled,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.resetLabel}>Reset</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

export default FeedFilterPanel;
