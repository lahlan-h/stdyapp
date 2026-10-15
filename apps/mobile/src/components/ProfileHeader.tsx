import { View, Text, Image } from "react-native";

import { useStyles } from "@theme";
import type { PublicProfile } from "@data";

import { defaultAvatar } from "./defaultAvatar";

interface ProfileHeaderProps {
  /**
   * The public half only, so this one header serves both the signed-in user and
   * anyone opened from search - and cannot render the email the first carries.
   */
  profile: PublicProfile;
}

/**
 * Both names are nullable in the database even though signup demands them, so
 * an older account can have neither. The username always exists, which is why
 * it is the fallback rather than an empty heading.
 *
 * Built the same way feedMapping builds an author's displayName. The two must
 * agree: the same person appears here and on their own post cards, and a name
 * assembled differently in each place reads as two different users.
 */
const displayNameOf = ({ firstName, lastName, username }: PublicProfile): string =>
  [firstName, lastName].filter(Boolean).join(" ") || username;

/** Avatar, name and bio. Renders from the profile it is given and queries nothing. */
const ProfileHeader = ({ profile }: ProfileHeaderProps) => {
  const styles = useStyles("profile");
  const displayName = displayNameOf(profile);

  return (
    <View style={styles.header}>
      <Image
        source={{ uri: profile.avatarUrl ?? defaultAvatar(displayName) }}
        style={styles.avatar}
        accessibilityIgnoresInvertColors
      />

      <View style={styles.identity}>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.username}>@{profile.username}</Text>
      </View>

      {/* Absent rather than blank when unset: an empty line under the username
          reads as a layout bug, and most accounts have no bio. */}
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
    </View>
  );
};

export default ProfileHeader;
