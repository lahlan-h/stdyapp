import { Fragment } from "react";
import { Image, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";

import { useStyles } from "@theme";
import type { FeedAuthor } from "@data";

import { defaultAvatar } from "./defaultAvatar";

interface StudiedWithProps {
  people: FeedAuthor[];
  /** Spacing from the surrounding card, which differs between feed and detail. */
  style?: StyleProp<ViewStyle>;
}

/** Names spelled out before the rest collapse into "and N others". */
const NAMED = 2;
/** Avatars in the stack, however many people there are. */
const PICTURED = 3;

/**
 * "Studied with Sam and Alex" - who else was in the session's group room.
 *
 * The social half of a post: it puts other people on it, and each name opens
 * their profile. Renders nothing for a solo session, so most cards are
 * unchanged.
 *
 * Kept to one line - a few overlapping avatars and at most two names, then
 * "and 3 others" - so a busy room never pushes the post itself down.
 */
const StudiedWith = ({ people, style }: StudiedWithProps) => {
  const styles = useStyles("home");
  if (people.length === 0) return null;

  // "and 1 others" reads wrong, so a room of exactly NAMED + 1 names everyone.
  const named = people.length === NAMED + 1 ? people : people.slice(0, NAMED);
  const others = people.length - named.length;

  const name = (person: FeedAuthor) => (
    <Text
      style={styles.studiedWithName}
      onPress={() => router.push(`/user/${person.id}`)}
      accessibilityRole="link"
    >
      {person.displayName}
    </Text>
  );

  return (
    <View style={[styles.studiedWith, style]}>
      <View style={styles.studiedWithAvatars} importantForAccessibility="no-hide-descendants">
        {people.slice(0, PICTURED).map((person, index) => (
          <Image
            key={person.id}
            style={[styles.studiedWithAvatar, index > 0 && styles.studiedWithAvatarOverlap]}
            source={{ uri: person.avatarUrl ?? defaultAvatar(person.displayName) }}
          />
        ))}
      </View>
      <Text style={styles.studiedWithText} numberOfLines={1}>
        Studied with{" "}
        {named.map((person, index) => (
          <Fragment key={person.id}>
            {index > 0 ? (index === named.length - 1 && others === 0 ? " and " : ", ") : null}
            {name(person)}
          </Fragment>
        ))}
        {others > 0 ? ` and ${others} other${others === 1 ? "" : "s"}` : null}
      </Text>
    </View>
  );
};

export default StudiedWith;
