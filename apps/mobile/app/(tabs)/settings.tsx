import { ScrollView, StatusBar, Switch, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";

import {
  useTheme,
  useSettingsStyles,
  useTabBarClearance,
  SETTINGS_FOOTER_ROOM,
} from "@theme";
import { useNotificationPreferences } from "@data";

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
  const settingsStyles = useSettingsStyles();
  const tabBarClearance = useTabBarClearance();
  const { preferences, setPreference } = useNotificationPreferences();

  /**
   * thumbColor is deliberately left to the platform. Setting it to a palette
   * colour puts a dark thumb on a dark track in dark mode; iOS's own thumb is
   * white against both track colours already.
   */
  const switchTrack = { false: colors.border, true: colors.primary };

  return (
    <LinearGradient
      colors={colors.gradients.background}
      style={settingsStyles.container}
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView
        style={settingsStyles.safeArea}
        edges={["top", "left", "right"]}
      >
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
            Every row here is inert. There is no auth in the app yet - nothing
            identifies the current user, so there is no account to edit, sign out
            of, or delete. Laid out now so the screen is complete, and marked
            isPlaceholder so neither the user nor the next dev mistakes a row for
            a working control. Wire these up when auth lands.
          */}
          <SettingsSection title="Account">
            <SettingsRow
              isPlaceholder
              isFirst
              icon="user"
              label="Edit profile"
              description="Name, username and avatar"
            />
            <SettingsRow
              isPlaceholder
              icon="lock"
              label="Privacy"
              description="Who can see your sessions"
            />
            <SettingsRow isPlaceholder icon="log-out" label="Sign out" />
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
