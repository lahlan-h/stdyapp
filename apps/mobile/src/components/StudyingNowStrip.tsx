import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, useReducedMotion } from "@theme";
import { requestStudySession, useStudyingNow, type StudyingMember } from "@data";

import { defaultAvatar } from "./defaultAvatar";
import { formatMinutes } from "./sessionFormat";

/** One full swell-and-fade of the live halo. Slow, so a row of them is calm. */
const PULSE_MS = 1800;

/** How often the running times move on. They show whole minutes. */
const TICK_MS = 30_000;

interface StudyingNowStripProps {
  groupId: string;
  groupName: string;
  /** False while the group's feed is not on screen - see useStudyingNow. */
  active: boolean;
}

/** The first name, else the username: a strip has room for one word. */
const shortName = (person: StudyingMember) =>
  person.displayName?.split(" ")[0] ?? person.username;

/** "8m", "1h 5m" - how long they have been at it. */
const elapsedOf = (startedAt: Date, now: number) =>
  formatMinutes(Math.max(0, Math.floor((now - startedAt.getTime()) / 60_000)));

/**
 * One swelling ring, shared by every avatar in the row so they breathe
 * together - a row of rings each on their own clock looks like a fault.
 * Held still under reduced motion: the green ring alone still says "live".
 */
const usePulse = (enabled: boolean) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, pulse]);
  return pulse;
};

/** A clock that moves on every TICK_MS while the strip is showing. */
const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);
  return now;
};

/**
 * The group feed's "who's studying" strip: everyone in the group who is in a
 * study session right now - any session, not only the group's own rooms - as
 * a row of live avatars with how long each has been at it.
 *
 * Led by a count tile that is the row's label, so it needs no heading of its
 * own. You come first when you are studying, as "You". A small group mark on
 * an avatar means that person is studying IN this group, in one of its rooms.
 *
 * Nobody studying is an invitation rather than a blank: one tap starts a
 * session in this group, through the same hand-off the group page's Start
 * button uses.
 */
const StudyingNowStrip = ({ groupId, groupName, active }: StudyingNowStripProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const reducedMotion = useReducedMotion();
  const { people, error, reload } = useStudyingNow(groupId, active);
  const now = useNow(active);
  const pulse = usePulse(active && !reducedMotion && Boolean(people?.length));

  const haloStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.38] }) }],
  };

  const startHere = () => {
    requestStudySession({ kind: "group", groupId, groupName });
    router.navigate("/study");
  };

  const open = (person: StudyingMember) => {
    if (person.isMine) router.navigate("/profile");
    else router.push(`/user/${person.userId}`);
  };

  if (!people) {
    // A failed FIRST read: say so, and let a tap try again. A failed refresh
    // keeps the last strip instead - see useStudyingNow.
    if (error) {
      return (
        <Pressable
          style={styles.stripEmpty}
          onPress={reload}
          accessibilityRole="button"
          accessibilityLabel={`${error} Tap to try again.`}
        >
          <View style={styles.stripEmptyIcon}>
            <Feather name="wifi-off" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.stripEmptyText}>
            <Text style={styles.stripEmptyTitle}>{error}</Text>
            <Text style={styles.stripEmptyCaption}>Tap to try again</Text>
          </View>
        </Pressable>
      );
    }
    return (
      <View style={styles.stripEmpty} accessibilityLabel="Loading who is studying">
        <View style={styles.stripEmptyIcon}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </View>
    );
  }

  if (people.length === 0) {
    return (
      <View style={styles.stripEmpty}>
        <View style={styles.stripEmptyIcon}>
          <Feather name="moon" size={18} color={colors.textMuted} />
        </View>
        <View style={styles.stripEmptyText}>
          <Text style={styles.stripEmptyTitle} numberOfLines={1}>
            Nobody's studying right now
          </Text>
          <Text style={styles.stripEmptyCaption} numberOfLines={1}>
            Be the first - the group sees you here
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.stripStart, pressed && { opacity: 0.8 }]}
          onPress={startHere}
          accessibilityRole="button"
          accessibilityLabel={`Start a session in ${groupName}`}
          hitSlop={6}
        >
          <Feather name="play" size={13} color="#ffffff" />
          <Text style={styles.stripStartLabel}>Start</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
      showsHorizontalScrollIndicator={false}
    >
      <View
        style={styles.stripItem}
        accessible
        accessibilityLabel={`${people.length} ${people.length === 1 ? "person" : "people"} studying now`}
      >
        <View style={styles.stripCount}>
          <Text style={styles.stripCountValue}>{people.length}</Text>
        </View>
        <Text style={styles.stripCountLabel}>studying</Text>
      </View>

      {people.map((person) => {
        const name = person.isMine ? "You" : shortName(person);
        const elapsed = elapsedOf(person.startedAt, now);
        return (
          <Pressable
            key={person.userId}
            style={({ pressed }) => [styles.stripItem, pressed && { opacity: 0.7 }]}
            onPress={() => open(person)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, studying for ${elapsed}${
              person.studyingHere ? `, in ${groupName}` : ""
            }. Open profile`}
          >
            <View style={styles.stripAvatarWrap}>
              {reducedMotion ? null : (
                <Animated.View pointerEvents="none" style={[styles.stripHalo, haloStyle]} />
              )}
              <Image
                style={styles.stripAvatar}
                source={{ uri: person.avatarUrl ?? defaultAvatar(person.displayName ?? person.username) }}
                accessibilityIgnoresInvertColors
              />
              {person.studyingHere ? (
                <View style={styles.stripHereBadge}>
                  <Feather name="users" size={9} color="#ffffff" />
                </View>
              ) : null}
            </View>
            <Text style={styles.stripName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.stripTime}>{elapsed}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

export default StudyingNowStrip;
