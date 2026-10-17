import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  useTheme,
  useStyles,
  LEADERBOARD_BACK_ICON_SIZE,
  LEADERBOARD_ICON_SIZE,
  LEADERBOARD_EMPTY_ICON_SIZE,
  LEADERBOARD_MEDALS,
  LEADERBOARD_PEDESTAL_HEIGHT,
} from "@theme";
import {
  useLeaderboard,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardRange,
} from "@data";

import { defaultAvatar } from "@components/defaultAvatar";
import {
  describeStanding,
  formatValue,
  nameOf,
  plural,
} from "@components/leaderboardFormat";

const METRICS: { key: LeaderboardMetric; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "weightedMinutes", label: "Focus time", icon: "clock" },
  { key: "focusScore", label: "Avg focus", icon: "target" },
  { key: "tasksCompleted", label: "Tasks", icon: "check-square" },
];

const RANGES: { key: LeaderboardRange; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "all", label: "All time" },
];

/** What each board means, said once under the list. */
const explain = (board: Leaderboard): string => {
  switch (board.metric) {
    case "weightedMinutes":
      return "Focus time is study minutes scaled by each session's focus estimate, so a timer left running does not count for much.";
    case "focusScore":
      return `The average focus estimate across sessions that have one. Needs ${plural(
        board.minScoredSessions ?? 0,
        "scored session",
      )} in the period to rank. An estimate from phone signals, not a medical measurement.`;
    case "tasksCompleted":
      return "Checklist items ticked off during study sessions.";
  }
};

/**
 * "You + 3 friends · this week", or "Library Night Owls · 5 members · this
 * week" - who is being compared, over what.
 */
const subtitleOf = (
  board: Leaderboard | undefined,
  range: LeaderboardRange,
  groupName: string | undefined,
) => {
  const period = range === "week" ? "this week" : "all time";
  if (groupName) {
    // Named before the board lands, so the subtitle never reads as someone
    // else's board for the moment the first request takes.
    return board?.memberCount
      ? `${groupName} · ${plural(board.memberCount, "member")} · ${period}`
      : `${groupName} · ${period}`;
  }
  if (!board || board.followingCount === null) return `Everyone · ${period}`;
  return board.followingCount === 0
    ? `Just you so far · ${period}`
    : `You + ${plural(board.followingCount, "friend")} · ${period}`;
};

const openProfile = (userId: string) => router.push(`/user/${userId}`);

// --- Motion ---------------------------------------------------------------------

/** Whether the system asks for reduced motion. Read once, kept in sync. */
const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
};

/**
 * Fades a block up into place, staggered by `order`. Opacity and transform
 * only, on the native driver, so it never shifts layout. Skipped entirely
 * under reduced motion - the content is simply there.
 */
const Rise = ({ order, children }: { order: number; children: ReactNode }) => {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay: Math.min(order, 8) * 45,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [order, reduced, progress]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// --- Screen ---------------------------------------------------------------------

/**
 * How you compare with the people you follow - or, opened from a study group's
 * feed with its id and name, with that group's members.
 *
 * Three tiers, in the order the eye should take them: your standing and the gap
 * to the next place (what you came to check), the podium (the race), then
 * everyone else. Every number comes from GET /api/focus/leaderboard - ranking,
 * ties and the focus board's session floor are decided by the API, so this only
 * arranges and words them.
 */
const LeaderboardScreen = () => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");
  const [metric, setMetric] = useState<LeaderboardMetric>("weightedMinutes");
  const [range, setRange] = useState<LeaderboardRange>("week");
  // Both or neither: the group feed's trophy passes the name along so the
  // header can say whose board this is without a second request.
  const { groupId, groupName } = useLocalSearchParams<{ groupId?: string; groupName?: string }>();
  const { board, isLoading, loadError, reload } = useLeaderboard(metric, range, groupId);

  // The board can belong to the PREVIOUS tab for a moment while the next
  // loads; rows are formatted by the metric they were ranked by, not the tab.
  const shownMetric = board?.metric ?? metric;
  const podium = board?.entries.slice(0, 3) ?? [];
  const rest = board?.entries.slice(3) ?? [];
  const leaderValue = board?.entries[0]?.value ?? 0;
  // Re-keyed per board so a tab change replays the entrance, which is what
  // tells the user the list they are looking at changed.
  const boardKey = `${shownMetric}-${board?.days ?? range}`;

  const header = (
    <View style={styles.listHeader}>
      {/* iOS large-title layout: controls on top, the title on its own line
          so it never has to share - or break - for the range switch. */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
        >
          <Feather name="chevron-left" size={LEADERBOARD_BACK_ICON_SIZE} color={colors.text} />
        </Pressable>
        <RangePill selected={range} onSelect={setRange} />
      </View>
      <View style={styles.titleColumn}>
        <Text style={styles.screenTitle}>Leaderboard</Text>
        <Text style={styles.screenSubtitle} numberOfLines={1}>
          {subtitleOf(board, range, groupName)}
        </Text>
      </View>

      <MetricTabs selected={metric} onSelect={setMetric} />

      {loadError ? (
        <Pressable style={styles.error} onPress={reload} accessibilityRole="button">
          <Feather name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>
            {loadError}
            {"\n"}Tap to try again.
          </Text>
        </Pressable>
      ) : null}

      {board ? (
        <View key={boardKey} style={styles.listHeader}>
          <Rise order={0}>
            <StandingCard board={board} />
          </Rise>
          {podium.length > 0 ? (
            <Rise order={1}>
              <Podium entries={podium} board={board} />
            </Rise>
          ) : null}
          {rest.length > 0 ? <Text style={styles.sectionLabel}>EVERYONE ELSE</Text> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
        <FlatList
          data={rest}
          keyExtractor={(entry) => `${boardKey}-${entry.userId}`}
          renderItem={({ item, index }) => (
            <Rise order={index + 2}>
              <Row
                entry={item}
                metric={shownMetric}
                isMine={item.userId === board?.me.userId}
                leaderValue={leaderValue}
              />
            </Rise>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !board ? (
              isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
            ) : board.entries.length === 0 ? (
              <EmptyBoard board={board} groupName={groupName} />
            ) : null
          }
          ListFooterComponent={
            board && board.entries.length > 0 ? (
              <View style={styles.listHeader}>
                {/* A small board is a lonely one: the fix is more people. */}
                {board.scope === "following" && board.entries.length < 4 ? <InviteNudge /> : null}
                <Text style={styles.footnote}>{explain(board)}</Text>
              </View>
            ) : null
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              // Only once something is on screen - the first load has its own
              // spinner, and two at once looks like a glitch.
              refreshing={isLoading && !!board}
              onRefresh={reload}
              tintColor={colors.textMuted}
            />
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

// --- Controls -------------------------------------------------------------------

/** Week / All time, as a compact pill in the header: secondary to the metric. */
const RangePill = ({
  selected,
  onSelect,
}: {
  selected: LeaderboardRange;
  onSelect: (key: LeaderboardRange) => void;
}) => {
  const styles = useStyles("leaderboard");
  return (
    <View style={styles.rangePill} accessibilityRole="tablist">
      {RANGES.map(({ key, label }) => {
        const isSelected = key === selected;
        return (
          <Pressable
            key={key}
            style={[styles.rangeOption, isSelected && styles.rangeOptionSelected]}
            onPress={() => onSelect(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={[styles.rangeLabel, isSelected && styles.rangeLabelSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const MetricTabs = ({
  selected,
  onSelect,
}: {
  selected: LeaderboardMetric;
  onSelect: (key: LeaderboardMetric) => void;
}) => {
  const styles = useStyles("leaderboard");
  const { colors } = useTheme();
  return (
    <View style={styles.segmentGroup} accessibilityRole="tablist">
      {METRICS.map(({ key, label, icon }) => {
        const isSelected = key === selected;
        return (
          <Pressable
            key={key}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <Feather
              name={icon}
              size={14}
              color={isSelected ? "#ffffff" : colors.textMuted}
            />
            <Text style={[styles.segmentLabel, isSelected && styles.segmentLabelSelected]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// --- Your standing --------------------------------------------------------------

/** Your rank, your number, and the distance to the next place up. */
const StandingCard = ({ board }: { board: Leaderboard }) => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");
  const standing = describeStanding(board);
  const formatted = formatValue(board.metric, board.me.value);
  const leading = board.me.rank === 1;

  return (
    <LinearGradient
      colors={[`${colors.primary}2E`, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.standing}
      accessible
      accessibilityLabel={`Your standing: ${
        board.me.rank === null ? "not ranked" : `rank ${board.me.rank} ${standing.outOf}`
      }, ${formatted.value} ${formatted.unit}. ${standing.gapText}.`}
    >
      <View style={styles.standingTop}>
        <View>
          <Text style={styles.standingRank}>{standing.rankLabel}</Text>
          <Text style={styles.standingOf}>{standing.outOf}</Text>
        </View>
        <View style={styles.standingDivider} />
        <View style={styles.standingValueColumn}>
          <Text style={styles.standingValue}>{formatted.value}</Text>
          <Text style={styles.standingUnit}>your {formatted.unit}</Text>
        </View>
      </View>

      <View style={styles.standingGap}>
        <Feather
          name={leading ? "trending-up" : board.me.rank === null ? "flag" : "chevrons-up"}
          size={LEADERBOARD_ICON_SIZE}
          color={leading ? colors.success : colors.primary}
        />
        <Text style={styles.standingGapText}>{standing.gapText}</Text>
      </View>

      {board.me.rank !== null ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(4, standing.progress * 100)}%`,
                backgroundColor: leading ? colors.success : colors.primary,
              },
            ]}
          />
        </View>
      ) : null}
    </LinearGradient>
  );
};

// --- Podium ---------------------------------------------------------------------

/**
 * The top three, second-first-third, with the winner raised. Places beyond the
 * board are drawn as open seats rather than left out, so a two-person board
 * still reads as a podium - and as room for one more.
 */
const Podium = ({ entries, board }: { entries: LeaderboardEntry[]; board: Leaderboard }) => {
  const styles = useStyles("leaderboard");
  // Visual order: 2nd, 1st, 3rd.
  const slots: { place: 1 | 2 | 3; entry?: LeaderboardEntry }[] = [
    { place: 2, entry: entries[1] },
    { place: 1, entry: entries[0] },
    { place: 3, entry: entries[2] },
  ];

  return (
    <View style={styles.podium}>
      {slots.map(({ place, entry }) => (
        <PodiumSlot
          key={place}
          place={place}
          entry={entry}
          metric={board.metric}
          isMine={entry?.userId === board.me.userId}
        />
      ))}
    </View>
  );
};

const PodiumSlot = ({
  place,
  entry,
  metric,
  isMine,
}: {
  place: 1 | 2 | 3;
  entry?: LeaderboardEntry;
  metric: LeaderboardMetric;
  isMine: boolean;
}) => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");
  // Ties share a rank, so the medal follows the rank the API gave, not the slot.
  const rank = entry?.rank ?? place;
  const medal = LEADERBOARD_MEDALS[(Math.min(rank, 3) as 1 | 2 | 3)];
  const first = place === 1;

  const pedestal = (
    <LinearGradient
      colors={[`${medal}${entry ? "40" : "14"}`, colors.surface]}
      style={[styles.pedestal, { height: LEADERBOARD_PEDESTAL_HEIGHT[place] }]}
    >
      <Text style={[styles.pedestalRank, { color: entry ? medal : colors.textMuted }]}>
        {entry ? rank : place}
      </Text>
    </LinearGradient>
  );

  if (!entry) {
    return (
      <View style={styles.podiumSlot}>
        <View style={styles.podiumPerson}>
          <View style={styles.openSeat}>
            <Feather name="user-plus" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.openSeatText}>Open spot</Text>
        </View>
        {pedestal}
      </View>
    );
  }

  const formatted = formatValue(metric, entry.value);

  return (
    <View style={styles.podiumSlot}>
      <Pressable
        style={({ pressed }) => [styles.podiumPerson, pressed && styles.pressed]}
        onPress={() => openProfile(entry.userId)}
        accessibilityRole="button"
        accessibilityLabel={`${rank === 1 ? "First" : rank === 2 ? "Second" : "Third"} place, ${nameOf(entry)}${isMine ? " (you)" : ""}, ${formatted.value} ${formatted.unit}`}
      >
        {first ? (
          <MaterialCommunityIcons name="crown" size={22} color={medal} style={styles.podiumCrown} />
        ) : null}
        <View style={[styles.podiumAvatarRing, { borderColor: medal }]}>
          <Image
            source={{ uri: entry.avatarUrl ?? defaultAvatar(nameOf(entry)) }}
            style={[styles.podiumAvatar, first && styles.podiumAvatarFirst]}
          />
        </View>
        <Text style={styles.podiumName} numberOfLines={1}>
          {nameOf(entry)}
        </Text>
        {isMine ? <Text style={styles.youTag}>YOU</Text> : null}
        <Text style={styles.podiumValue}>{formatted.value}</Text>
      </Pressable>
      {pedestal}
    </View>
  );
};

// --- Everyone else --------------------------------------------------------------

/** 4th place and below, each with a bar against the leader. */
const Row = ({
  entry,
  metric,
  isMine,
  leaderValue,
}: {
  entry: LeaderboardEntry;
  metric: LeaderboardMetric;
  isMine: boolean;
  leaderValue: number;
}) => {
  const styles = useStyles("leaderboard");
  const { colors } = useTheme();
  const name = isMine ? `${nameOf(entry)} (you)` : nameOf(entry);
  const formatted = formatValue(metric, entry.value);
  const share = leaderValue > 0 ? Math.max(0.04, Math.min(1, entry.value / leaderValue)) : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, isMine && styles.rowMine, pressed && styles.pressed]}
      onPress={() => openProfile(entry.userId)}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${entry.rank}, ${name}, ${formatted.value} ${formatted.unit}, ${plural(entry.sessions, "session")}`}
    >
      <Text style={styles.rank}>{entry.rank}</Text>
      <Image
        source={{ uri: entry.avatarUrl ?? defaultAvatar(nameOf(entry)) }}
        style={styles.avatar}
      />
      <View style={styles.nameColumn}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.rowBarTrack}>
          <View
            style={[
              styles.rowBarFill,
              { width: `${share * 100}%` },
              isMine && { backgroundColor: colors.primary },
            ]}
          />
        </View>
      </View>
      <View style={styles.valueColumn}>
        <Text style={styles.value}>{formatted.value}</Text>
        <Text style={styles.valueUnit}>{plural(entry.sessions, "session")}</Text>
      </View>
    </Pressable>
  );
};

/** The fix for a small board is more people, so say where to find them. */
const InviteNudge = () => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");
  return (
    <Pressable
      style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
      // dismissTo, not navigate: this screen is pushed over the tabs, and
      // navigate would stack a second copy of them - see group/[id].tsx.
      onPress={() => router.dismissTo("/")}
      accessibilityRole="button"
      accessibilityLabel="Find classmates to follow, from the Feed"
    >
      <Feather name="user-plus" size={18} color={colors.primary} />
      <Text style={styles.inviteText}>
        Leaderboards are better with friends.{" "}
        <Text style={styles.inviteStrong}>Find classmates on the Feed</Text>
      </Text>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
};

/**
 * Nobody on the board. Two different stories: following nobody (the fix is to
 * follow people) and following people who have not studied in this period. A
 * group board only ever tells the second, in the group's name.
 */
const EmptyBoard = ({ board, groupName }: { board: Leaderboard; groupName?: string }) => {
  const { colors } = useTheme();
  const styles = useStyles("leaderboard");

  const followsNobody = board.scope === "following" && board.followingCount === 0;
  const period = board.days === "all" ? "yet" : "this week";
  const who = board.scope === "group" && groupName ? `No one in ${groupName}` : "No one";

  return (
    <View style={styles.empty}>
      <Feather
        name={followsNobody ? "users" : "award"}
        size={LEADERBOARD_EMPTY_ICON_SIZE}
        color={colors.textMuted}
      />
      <Text style={styles.emptyTitle}>
        {followsNobody ? "Follow people to see them here" : `${who} has ranked ${period}`}
      </Text>
      <Text style={styles.emptyText}>
        {followsNobody
          ? "Search for classmates from the Feed and follow them to compare study stats."
          : board.metric === "focusScore"
            ? `The focus board needs ${plural(board.minScoredSessions ?? 0, "scored session")} per person. Finish a few sessions to get on it.`
            : "Finish a study session to get on the board."}
      </Text>
      {followsNobody ? <InviteNudge /> : null}
    </View>
  );
};

export default LeaderboardScreen;
