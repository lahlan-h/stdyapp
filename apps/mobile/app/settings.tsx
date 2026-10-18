import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import Constants from "expo-constants";
import { router } from "expo-router";

import {
  useTheme,
  useStyles,
  SETTINGS_FOOTER_ROOM,
  SETTINGS_BACK_ICON_SIZE,
  ROW_ICON_SIZE,
} from "@theme";
import { useNotificationPreferences } from "@data";

import SettingsSection from "@components/SettingsSection";
import SettingsRow from "@components/SettingsRow";
import { confirmSignOut } from "@components/confirmSignOut";
import DeleteAccountDialog from "@components/DeleteAccountDialog";
import ThemeSegmentedControl from "@components/ThemeSegmentedControl";

/**
 * Read from the manifest rather than hard-coded, so it cannot drift from the
 * version in app.json that actually ships.
 */
const APP_VERSION = Constants.expoConfig?.version ?? "unknown";

/**
 * Opened from the gear on your own profile.
 *
 * A push over the tabs rather than a tab of its own: settings are visited
 * rarely, so they gave their slot on the bar to screens used every day. Like
 * every pushed screen it carries its own back button - the root Stack hides
 * every header - and it pads for the home indicator rather than the tab bar,
 * which a pushed screen covers.
 */
const Settings = () => {
  const { colors } = useTheme();
  const settingsStyles = useStyles("settings");
  const insets = useSafeAreaInsets();
  const { preferences, setPreference } = useNotificationPreferences();
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  /**
   * thumbColor is deliberately left to the platform. Setting it to a palette
   * colour puts a dark thumb on a dark track in dark mode; iOS's own thumb is
   * white against both track colours already.
   */
  const switchTrack = { false: colors.border, true: colors.primary };

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
            { paddingBottom: insets.bottom + SETTINGS_FOOTER_ROOM },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={settingsStyles.header}>
            <Pressable
              style={({ pressed }) => [settingsStyles.back, pressed && { opacity: 0.6 }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather name="chevron-left" size={SETTINGS_BACK_ICON_SIZE} color={colors.text} />
            </Pressable>
            <Text style={settingsStyles.screenTitle}>Settings</Text>
          </View>

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

          {/* Analytics and Routines both live under the Study tab. */}
          {/*
            Edit profile, Manage subscription, Sign out and Delete account are
            live. Privacy is still a placeholder: the API stores isPrivate but
            nothing enforces it yet. Delete account opens a dialog that asks for
            the password first - nothing is deleted from the row itself.
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
              icon="credit-card"
              label="Manage subscription"
              description="Free or Premium, and billing"
              onPress={() => router.push("/plans")}
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
              isDestructive
              icon="trash-2"
              label="Delete account"
              onPress={() => setDeleteOpen(true)}
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

      <DeleteAccountDialog
        visible={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </LinearGradient>
  );
};

export default Settings;