import {
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import Constants from "expo-constants";
import { router } from "expo-router";

import {
  useTheme,
  useStyles,
  useTabBarClearance,
  SETTINGS_FOOTER_ROOM,
  ROW_ICON_SIZE,
} from "@theme";
import { useNotificationPreferences, logout } from "@data";

import SettingsSection from "@components/SettingsSection";
import SettingsRow from "@components/SettingsRow";
import ThemeSegmentedControl from "@components/ThemeSegmentedControl";

/**
 * Read from the manifest rather than hard-coded, so it cannot drift from the
 * version in app.json that actually ships.
 */
const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

const Settings = () => {
  const { colors } = useTheme();
  const settingsStyles = useStyles("settings");
  const tabBarClearance = useTabBarClearance();
  const { preferences, setPreference } = useNotificationPreferences();

  /**
   * thumbColor is deliberately left to the platform. Setting it to a palette
   * colour puts a dark thumb on a dark track in dark mode; iOS's own thumb is
   * white against both track colours already.
   */
  const switchTrack = { false: colors.border, true: colors.primary };

  /**
   * Confirmed first: it is one tap from the bottom of a scroll, and undoing it
   * means signing in again. No navigation here: logout flips the session and
   * the root layout's guard returns to login. It also forgets a remembered
   * session, so the next launch starts at login too.
   */
  const confirmSignOut = () => {
    // react-native-web's Alert.alert is a no-op, so web asks the browser.
    if (Platform.OS === "web") {
      if (window.confirm("Sign out? You will need to sign in again to use stdy.")) {
        void logout();
      }
      return;
    }
    Alert.alert("Sign out?", "You will need to sign in again to use stdy.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <LinearGradient colors={colors.gradients.background} style={settingsStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={settingsStyles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[
            settingsStyles.scrollContent,
            { paddingBottom: tabBarClearance + SETTINGS_FOOTER_ROOM },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={settingsStyles.screenTitle}>Settings</Text>

          <SettingsSection title="Appearance">
            <ThemeSegmentedControl />
          </SettingsSection>

          <SettingsSection
            title="Notifications"
            footnote="Your choices are saved, but nothing is sent yet - notifications are not wired up."
          >
            <SettingsRow
              isFirst
              icon="clock"
              label="Study reminders"
              description="Nudges to start a session"
              right={
                <Switch
                  value={preferences.studyReminders}
                  onValueChange={(value) => setPreference("studyReminders", value)}
                  trackColor={switchTrack}
                  ios_backgroundColor={colors.border}
                  accessibilityLabel="Study reminders"
                />
              }
            />
            <SettingsRow
              icon="users"
              label="Friend activity"
              description="When friends log a session"
              right={
                <Switch
                  value={preferences.friendActivity}
                  onValueChange={(value) => setPreference("friendActivity", value)}
                  trackColor={switchTrack}
                  ios_backgroundColor={colors.border}
                  accessibilityLabel="Friend activity"
                />
              }
            />
            <SettingsRow
              icon="bar-chart-2"
              label="Weekly summary"
              description="A recap every Sunday"
              right={
                <Switch
                  value={preferences.weeklySummary}
                  onValueChange={(value) => setPreference("weeklySummary", value)}
                  trackColor={switchTrack}
                  ios_backgroundColor={colors.border}
                  accessibilityLabel="Weekly summary"
                />
              }
            />
          </SettingsSection>

          {/*
            Edit profile and Sign out are live. Privacy and Delete account are
            still placeholders: the API stores isPrivate but nothing enforces it
            yet, and account deletion needs its own confirm-with-password flow.
          */}
          <SettingsSection title="Account">
            <SettingsRow
              isFirst
              icon="user"
              label="Edit profile"
              description="Name, username and bio"
              onPress={() => router.push("/edit-profile")}
              right={<Feather name="chevron-right" size={ROW_ICON_SIZE} color={colors.textMuted} />}
            />
            <SettingsRow
              isPlaceholder
              icon="lock"
              label="Privacy"
              description="Who can see your sessions"
            />
            <SettingsRow icon="log-out" label="Sign out" onPress={confirmSignOut} />
            <SettingsRow
              isPlaceholder
              isDestructive
              icon="trash-2"
              label="Delete account"
            />
          </SettingsSection>

          <SettingsSection title="About">
            <SettingsRow
              isFirst
              icon="info"
              label="Version"
              right={<Text style={settingsStyles.rowDescription}>{APP_VERSION}</Text>}
            />
            {/* Placeholders: these documents do not exist yet, so there is
                nothing to link to. */}
            <SettingsRow isPlaceholder icon="shield" label="Privacy policy" />
            <SettingsRow isPlaceholder icon="file-text" label="Terms of service" />
          </SettingsSection>

          <View style={settingsStyles.footer}>
            <Text style={settingsStyles.footerText}>stdyapp</Text>
            <Text style={settingsStyles.footerText}>
              Set goals, find friends, see results.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default Settings;