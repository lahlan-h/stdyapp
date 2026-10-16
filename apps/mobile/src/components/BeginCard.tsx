import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, haptics, BEGIN_CHEVRON_SIZE } from "@theme";
import { useGroups, useStreak, type SessionGroup } from "@data";

import DurationPicker from "./DurationPicker";
import LockInSlider from "./LockInSlider";
import LockInCountdown from "./LockInCountdown";
import { formatMinutes } from "./sessionFormat";

interface BeginCardProps {
  /** A start is already in flight - the track says so and ignores more. */
  busy: boolean;
  /** The chosen length in seconds; 0 is open-ended - a stopwatch to End. */
  plannedSec: number;
  onChangePlannedSec: (seconds: number) => void;
  /** The group the session will be studied in, or null for solo. */
  group: SessionGroup | null;
  onChangeGroup: (group: SessionGroup | null) => void;
  /** Starts the session - after the countdown. */
  onStart: () => void;
}

/** The lengths offered at a tap. Custom opens the wheels for anything else. */
const PRESETS: { label: string; seconds: number }[] = [
  { label: "Free", seconds: 0 },
  { label: "25m", seconds: 25 * 60 },
  { label: "50m", seconds: 50 * 60 },
  { label: "90m", seconds: 90 * 60 },
];

/** The streak, as a reason to start rather than a statistic. */
const streakLine = (count: number | undefined, isActiveToday: boolean | undefined) => {
  if (count === undefined) return null;
  if (count === 0) return "Start a streak today";
  if (isActiveToday) return `${count}-day streak - nice`;
  return `Keep your ${count}-day streak alive`;
};

/**
 * How a session starts: choose how long and with whom, then slide the big
 * Start button across to lock in.
 *
 * Everything that changes what Start does is on this one card, above the
 * track: length as chips (Free counts up until End; the rest count down), and
 * who it is studied with, which opens a list of your groups. The streak sits
 * at the top as the reason to begin. Locking in runs a three-second countdown
 * - see LockInCountdown - and only then is the session created, so "Not yet"
 * leaves nothing behind.
 */
const BeginCard = ({
  busy,
  plannedSec,
  onChangePlannedSec,
  group,
  onChangeGroup,
  onStart,
}: BeginCardProps) => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const { streak } = useStreak();

  const [counting, setCounting] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [choosing, setChoosing] = useState<"length" | "group" | null>(null);

  const isPreset = PRESETS.some((preset) => preset.seconds === plannedSec);
  const line = streakLine(streak?.currentCount, streak?.isActiveToday);

  const pickLength = (seconds: number) => {
    haptics.tick();
    onChangePlannedSec(seconds);
  };

  return (
    <LinearGradient
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.beginCard}
    >
      <View style={styles.beginHeader}>
        <Text style={styles.beginTitle}>Begin</Text>
        {line ? (
          <View style={styles.streakPill}>
            <Feather
              name="zap"
              size={14}
              color={streak?.isActiveToday ? colors.warning : colors.textMuted}
            />
            <Text style={styles.streakPillText}>{line}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.beginLabel}>How long</Text>
      <View style={styles.lengthChips} accessibilityRole="radiogroup">
        {PRESETS.map(({ label, seconds }) => {
          const selected = plannedSec === seconds;
          return (
            <Pressable
              key={label}
              style={[styles.lengthChip, selected && styles.lengthChipSelected]}
              onPress={() => pickLength(seconds)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={seconds === 0 ? "Free - no time limit" : `${seconds / 60} minutes`}
            >
              <Text
                style={[styles.lengthChipText, selected && styles.lengthChipTextSelected]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.lengthChip, !isPreset && styles.lengthChipSelected]}
          onPress={() => {
            haptics.tick();
            setChoosing("length");
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: !isPreset }}
          accessibilityLabel={isPreset ? "Custom length" : `Custom, ${formatMinutes(plannedSec / 60)}`}
        >
          <Text
            style={[styles.lengthChipText, !isPreset && styles.lengthChipTextSelected]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {isPreset ? "Custom" : formatMinutes(plannedSec / 60)}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.beginCaption}>
        {plannedSec === 0
          ? "Counts up until you end it."
          : "Counts down. Study it all to earn the Hit the plan badge."}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.withRow, pressed && { opacity: 0.7 }]}
        onPress={() => {
          haptics.tick();
          setChoosing("group");
        }}
        accessibilityRole="button"
        accessibilityLabel={`Studying with ${group?.name ?? "nobody - solo"}. Change`}
      >
        <Feather name={group ? "users" : "user"} size={18} color={colors.primary} />
        <View style={styles.withText}>
          <Text style={styles.beginLabel}>Studying with</Text>
          <Text style={styles.withValue} numberOfLines={1}>
            {group?.name ?? "Just me"}
          </Text>
        </View>
        <Feather name="chevron-right" size={BEGIN_CHEVRON_SIZE} color={colors.textMuted} />
      </Pressable>

      {busy ? (
        <View style={styles.lockInBusy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.beginCaption}>Starting…</Text>
        </View>
      ) : (
        <LockInSlider
          onLockIn={() => setCounting(true)}
          disabled={busy || counting}
          resetKey={resetKey}
        />
      )}

      <LockInCountdown
        visible={counting}
        onCancel={() => {
          haptics.tap();
          setCounting(false);
          setResetKey((key) => key + 1);
        }}
        onDone={() => {
          setCounting(false);
          setResetKey((key) => key + 1);
          onStart();
        }}
      />

      <LengthSheet
        visible={choosing === "length"}
        seconds={plannedSec}
        onDone={(seconds) => {
          onChangePlannedSec(seconds);
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />

      {choosing === "group" ? (
        <GroupSheet
          selectedId={group?.id ?? null}
          onPick={(next) => {
            haptics.tick();
            onChangeGroup(next);
            setChoosing(null);
          }}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </LinearGradient>
  );
};

/** A sheet with the duration wheels, for a length the chips do not offer. */
const LengthSheet = ({
  visible,
  seconds,
  onDone,
  onClose,
}: {
  visible: boolean;
  seconds: number;
  onDone: (seconds: number) => void;
  onClose: () => void;
}) => {
  const styles = useStyles("study");
  const insets = useSafeAreaInsets();
  // Starts from the current length, or an hour if that is Free - a wheel at
  // all zeros would mean nothing.
  const [draft, setDraft] = useState(seconds || 60 * 60);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setDraft(seconds || 60 * 60)}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>How long?</Text>
        <DurationPicker seconds={draft} onChange={setDraft} />
        <Pressable
          style={[styles.action, draft === 0 && styles.actionDisabled]}
          disabled={draft === 0}
          onPress={() => {
            haptics.tick();
            onDone(draft);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Use ${formatMinutes(draft / 60)}`}
        >
          <Text style={styles.actionText}>Use {formatMinutes(draft / 60)}</Text>
        </Pressable>
      </View>
    </Modal>
  );
};

/**
 * Who the session is with: just you, or one of your groups. Mounted only while
 * open, so your groups are read when you ask to choose - not on every visit to
 * the Study tab.
 */
const GroupSheet = ({
  selectedId,
  onPick,
  onClose,
}: {
  selectedId: string | null;
  onPick: (group: SessionGroup | null) => void;
  onClose: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useStyles("study");
  const insets = useSafeAreaInsets();
  const { myGroups, isLoading, loadError } = useGroups();

  const row = (key: string, label: string, caption: string, selected: boolean, next: SessionGroup | null) => (
    <Pressable
      key={key}
      style={({ pressed }) => [styles.pickRow, selected && styles.pickRowSelected, pressed && { opacity: 0.7 }]}
      onPress={() => onPick(next)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${caption}`}
    >
      <View style={styles.withText}>
        <Text style={styles.withValue} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.beginCaption}>{caption}</Text>
      </View>
      {selected ? <Feather name="check" size={18} color={colors.primary} /> : null}
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, styles.pickSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Studying with</Text>
        <ScrollView style={styles.pickList} contentContainerStyle={styles.pickListContent}>
          {row("solo", "Just me", "A session of your own", selectedId === null, null)}
          {myGroups === undefined ? (
            loadError ? (
              <Text style={styles.beginCaption}>{loadError}</Text>
            ) : isLoading ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : null
          ) : myGroups.length === 0 ? (
            <Text style={styles.beginCaption}>
              Join or create a group below to study in one.
            </Text>
          ) : (
            myGroups.map((g) =>
              row(
                g.id,
                g.name,
                "Members can see you and join your room",
                selectedId === g.id,
                { id: g.id, name: g.name },
              ),
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

export default BeginCard;
