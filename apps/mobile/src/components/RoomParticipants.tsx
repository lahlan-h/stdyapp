import { Image, Text, View } from "react-native";

import { useStudyStyles } from "@theme";
import { useRoom } from "@data";

import { defaultAvatar } from "@components/defaultAvatar";

const minutesIn = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/**
 * Who else is in this group session, live - shown under the dial while one
 * runs.
 *
 * Joins and leaves arrive over the notification socket (see useRoom). Someone
 * gone quiet stays listed as away rather than disappearing: a locked phone
 * stops sampling too, and they may well still be studying.
 */
const RoomParticipants = ({ sessionId }: { sessionId: string }) => {
  const styles = useStudyStyles();
  const { participants } = useRoom(sessionId);

  if (!participants) return null;

  const others = participants.filter((p) => !p.isMine);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>In this session</Text>
        <Text style={styles.cardCount}>{participants.length}</Text>
      </View>

      {others.length === 0 ? (
        <Text style={styles.emptyText}>
          Just you so far. Share your code and others can join.
        </Text>
      ) : null}

      {participants.map((p) => (
        <View
          key={p.sessionId}
          style={styles.personRow}
          accessible
          accessibilityLabel={[
            p.isMine ? "You" : p.user.username,
            `${minutesIn(p.startedAt)} minutes in`,
            p.isAway ? "away" : null,
          ]
            .filter(Boolean)
            .join(", ")}
        >
          <Image
            style={[styles.avatar, p.isAway && styles.avatarAway]}
            source={{ uri: p.user.avatarUrl ?? defaultAvatar(p.user.username) }}
          />
          <Text style={styles.personName} numberOfLines={1}>
            {p.isMine ? "You" : p.user.username}
          </Text>
          <Text style={styles.personMeta}>
            {p.isAway ? "Away" : `${minutesIn(p.startedAt)}m in`}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default RoomParticipants;
