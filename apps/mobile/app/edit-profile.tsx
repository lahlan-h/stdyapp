import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useAccountStyles, ACCOUNT_BACK_ICON_SIZE } from "@theme";
import {
  useProfile,
  MAX_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
  USERNAME_PATTERN,
  type Profile,
  type ProfileEdit,
} from "@data";

interface Form {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
}

const toForm = (profile: Profile): Form => ({
  firstName: profile.firstName ?? "",
  lastName: profile.lastName ?? "",
  username: profile.username,
  bio: profile.bio ?? "",
});

/**
 * The fields that changed, trimmed, plus what is wrong with them.
 *
 * Only changed fields are sent: PATCH is partial, and resending an unchanged
 * username would still cost a unique-index check. A name cannot be cleared -
 * the API's nameSchema is min(1) after trim - so an emptied name is an error
 * here rather than a 400 there.
 */
const diff = (form: Form, profile: Profile) => {
  const edit: ProfileEdit = {};
  const errors: Partial<Record<keyof Form, string>> = {};
  const original = toForm(profile);

  for (const key of ["firstName", "lastName"] as const) {
    const value = form[key].trim();
    if (value === original[key]) continue;
    if (!value) errors[key] = "Cannot be empty.";
    else edit[key] = value;
  }

  const username = form.username.trim();
  if (username !== original.username) {
    if (username.length < MIN_USERNAME_LENGTH) {
      errors.username = `At least ${MIN_USERNAME_LENGTH} characters.`;
    } else if (!USERNAME_PATTERN.test(username)) {
      errors.username = "Letters, numbers and underscores only.";
    } else {
      edit.username = username;
    }
  }

  // An empty bio IS allowed, so clearing one is a real edit.
  const bio = form.bio.trim();
  if (bio !== original.bio) edit.bio = bio;

  return { edit, errors };
};

const EditProfile = () => {
  const { colors } = useTheme();
  const styles = useAccountStyles();
  const insets = useSafeAreaInsets();
  const { profile, isLoading, loadError, reload, save, isSaving, saveError, resetSaveError } =
    useProfile();

  const [form, setForm] = useState<Form | null>(null);

  // Seeded once, when the profile first arrives. Re-seeding on every profile
  // change would wipe a half-typed edit if anything refetched underneath it.
  useEffect(() => {
    if (profile && !form) setForm(toForm(profile));
  }, [profile, form]);

  const update = (key: keyof Form) => (value: string) => {
    resetSaveError();
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const result = form && profile ? diff(form, profile) : null;
  const hasErrors = result ? Object.keys(result.errors).length > 0 : false;
  const hasChanges = result ? Object.keys(result.edit).length > 0 : false;
  const canSave = hasChanges && !hasErrors && !isSaving;

  const submit = async () => {
    if (!result || !canSave) return;
    if (await save(result.edit)) router.back();
  };

  const field = (
    key: keyof Form,
    label: string,
    max: number,
    extra: TextInputProps = {},
  ) => {
    if (!form) return null;
    const error = result?.errors[key];
    return (
      <View style={styles.field}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.counter}>
            {form[key].length} / {max}
          </Text>
        </View>
        <TextInput
          style={[
            styles.input,
            !!extra.multiline && styles.inputMultiline,
            !!error && styles.inputInvalid,
          ]}
          value={form[key]}
          onChangeText={update(key)}
          maxLength={max}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          {...extra}
        />
        {error ? <Text style={[styles.hint, styles.hintInvalid]}>{error}</Text> : null}
      </View>
    );
  };

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable
                style={styles.back}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather name="chevron-left" size={ACCOUNT_BACK_ICON_SIZE} color={colors.text} />
              </Pressable>
              <Text style={styles.screenTitle}>Edit profile</Text>
            </View>

            {isLoading && !form ? (
              <ActivityIndicator color={colors.textMuted} />
            ) : loadError && !form ? (
              <Pressable onPress={reload} accessibilityRole="button">
                <Text style={styles.stateText}>{loadError}{"\n"}Tap to try again.</Text>
              </Pressable>
            ) : (
              <>
                {field("firstName", "First name", MAX_NAME_LENGTH, {
                  autoComplete: "given-name",
                  textContentType: "givenName",
                })}
                {field("lastName", "Last name", MAX_NAME_LENGTH, {
                  autoComplete: "family-name",
                  textContentType: "familyName",
                })}
                {field("username", "Username", MAX_USERNAME_LENGTH, {
                  autoCapitalize: "none",
                  autoCorrect: false,
                })}
                {field("bio", "Bio", MAX_BIO_LENGTH, {
                  multiline: true,
                  placeholder: "What are you studying?",
                })}

                {saveError ? (
                  <View style={styles.error}>
                    <Feather name="alert-circle" size={18} color={colors.danger} />
                    <Text style={styles.errorText}>{saveError}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
            <Pressable
              onPress={submit}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.submit,
                !canSave && styles.submitDisabled,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save profile"
              accessibilityState={{ disabled: !canSave, busy: isSaving }}
            >
              <LinearGradient
                colors={colors.gradients.primary}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.submitFill}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitLabel}>Save</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default EditProfile;