import { View, Text, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme, useStyles } from "@theme";
import type { PublicProfile } from "@data";

import { defaultAvatar } from "./defaultAvatar";

interface ProfileCardProps {
  profile: PublicProfile;
  /**
   * Completed sessions. Undefined while loading - and on someone else's
   * profile, where GET /api/sessions (self-only) has nothing to give, so the
   * figure is left out entirely via showSessions rather than held at a dash.
   */
  sessions?: number;
  showSessions: boolean;
  followers?: number;
  following?: number;
}

/**
 * A dash while a figure is still loading, rather than a zero. Zero is a real
 * answer - plenty of accounts have no followers - so showing it before the
 * count arrives would state something false and then quietly correct itself.
 */
const show = (value?: number): string => (value === undefined ? "—" : String(value));

/**
 * Both names are nullable in the database even though signup demands them, so
 * an older account can have neither; the username always exists. Built the
 * way feedMapping builds an author's displayName - the same person shows on
 * their own posts, and two spellings would read as two people.
 */
const displayNameOf = ({ firstName, lastName, username }: PublicProfile): string =>
  [firstName, lastName].filter(Boolean).join(" ") || username;

/**
 * The design's profile card: avatar, name and the three counts in a row, then
 * the bio. Renders what it is given and queries nothing.
 */
const ProfileCard = ({ profile, sessions, showSessions, followers, following }: ProfileCardProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");
  const displayName = displayNameOf(profile);

  const stats: { label: string; value: string }[] = [
    ...(showSessions ? [{ label: "Sessions", value: show(sessions) }] : []),
    { label: "Followers", value: show(followers) },
    { label: "Following", value: show(following) },
  ];

  return (
    <LinearGradient
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <Image
          source={{ uri: profile.avatarUrl ?? defaultAvatar(displayName) }}
          style={styles.cardAvatar}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.cardStats}>
            {stats.map(({ label, value }) => (
              <View
                key={label}
                style={styles.cardStat}
                accessible
                accessibilityLabel={`${value} ${label}`}
              >
                <Text style={styles.cardStatLabel}>{label}</Text>
                <Text style={styles.cardStatValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Absent rather than an empty label when unset: most accounts have no
          bio, and a "Bio" heading over nothing reads as a load failure. */}
      {profile.bio ? (
        <View style={styles.cardField}>
          <Text style={styles.cardFieldLabel}>Bio</Text>
          <Text style={styles.cardFieldValue}>{profile.bio}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
};

export default ProfileCard;
