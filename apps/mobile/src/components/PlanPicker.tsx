import { useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useStyles,
  PLANS_BACK_ICON_SIZE,
  PLANS_ICON_SIZE,
} from "@theme";
import {
  PLANS,
  finishChoosingPlan,
  useSubscription,
  type Plan,
  type Subscription,
} from "@data";
import { confirmGroupAction } from "@components/confirmGroup";

interface PlanPickerProps {
  /**
   * onboarding: straight after creating an account, from choose-plan. No way
   * back - the feed is behind the guard until a plan is picked.
   *
   * manage: from Settings' Manage subscription, via plans. A push like edit
   * profile, with a back button and a way to cancel.
   */
  mode: "onboarding" | "manage";
  /** Where Stripe Checkout sent the browser back from, on web - see plans.tsx. */
  checkout?: "success" | "cancelled";
}

const formatDate = (iso: string | null): string | null =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

/** One line about the paid period, or null when there is nothing to say. */
const describePremium = (subscription: Subscription): string | null => {
  const date = formatDate(subscription.renewsAt);
  if (!date) return null;
  return subscription.status === "CANCELLED"
    ? `Cancelled - you keep Premium until ${date}.`
    : `Renews on ${date}.`;
};

/**
 * Free or Premium, for both ways in: a brand-new account (onboarding) and
 * Settings (manage).
 *
 * Free is not a purchase - it is the absence of a subscription - so picking it
 * only ends onboarding. Premium opens Stripe Checkout, and the card flips to
 * "Current plan" once the webhook has landed; see useSubscription for that
 * wait.
 */
const PlanPicker = ({ mode, checkout }: PlanPickerProps) => {
  const { colors } = useTheme();
  const styles = useStyles("plans");
  const {
    subscription,
    isLoading,
    isWorking,
    isConfirming,
    error,
    reload,
    startCheckout,
    waitForPayment,
    stopWaiting,
    cancel,
  } = useSubscription();

  const onboarding = mode === "onboarding";
  const isPremium = subscription?.isPremium === true;
  const busy = isWorking || isConfirming;

  // Back from Checkout on web: this is a fresh page load, so pick the wait up
  // where startCheckout's redirect left it.
  useEffect(() => {
    if (checkout === "success") waitForPayment();
  }, [checkout, waitForPayment]);

  // Paid during onboarding: straight on to the feed. The payment was the last
  // thing to wait for, and a Continue tap after it is one too many.
  useEffect(() => {
    if (onboarding && isPremium) finishChoosingPlan();
  }, [onboarding, isPremium]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const confirmCancel = () => {
    const until = formatDate(subscription?.renewsAt ?? null);
    confirmGroupAction(
      "Cancel Premium?",
      until
        ? `You keep Premium until ${until}, then move to Free. You won't be charged again.`
        : "You'll move to Free at the end of this billing period.",
      "Cancel Premium",
      () => void cancel(),
    );
  };

  const primaryButton = (label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.primary,
        busy && styles.disabled,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy: isWorking }}
    >
      <LinearGradient
        colors={colors.gradients.primary}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.primaryFill}
      >
        {isWorking ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryLabel}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );

  const secondaryButton = (
    label: string,
    onPress: () => void,
    { destructive = false }: { destructive?: boolean } = {},
  ) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.secondary,
        destructive && styles.destructive,
        busy && styles.disabled,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
    >
      <Text style={[styles.secondaryLabel, destructive && styles.destructiveLabel]}>
        {label}
      </Text>
    </Pressable>
  );

  const card = (plan: Plan, isCurrent: boolean, footer: ReactNode) => (
    <View style={[styles.card, isCurrent && styles.cardCurrent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.planName}>{plan.name}</Text>
        {isCurrent ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>CURRENT PLAN</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{plan.price}</Text>
        <Text style={styles.cadence}>{plan.cadence}</Text>
      </View>
      <Text style={styles.tagline}>{plan.tagline}</Text>

      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.feature}>
            <Feather name="check" size={PLANS_ICON_SIZE} color={colors.success} />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {footer}
    </View>
  );

  // Free is "current" only once we know: during the first load, and in
  // onboarding where nothing has been picked yet, neither card is marked.
  const freeIsCurrent = !onboarding && subscription === null;

  const freeFooter =
    onboarding && !isPremium
      ? secondaryButton("Continue with Free", finishChoosingPlan)
      : null;

  const premiumStatus = subscription && isPremium ? describePremium(subscription) : null;
  const premiumFooter = isPremium ? (
    <>
      {premiumStatus ? <Text style={styles.status}>{premiumStatus}</Text> : null}
      {/*
        Only an ACTIVE plan can be cancelled - the API 409s the rest - and only
        from Settings: onboarding moves on to the feed as soon as it is paid.
      */}
      {!onboarding && subscription?.status === "ACTIVE"
        ? secondaryButton("Cancel subscription", confirmCancel, { destructive: true })
        : null}
    </>
  ) : (
    <>
      {primaryButton(onboarding ? "Get Premium" : "Upgrade to Premium", () => {
        void startCheckout();
      })}
      <Text style={styles.finePrint}>
        Secure checkout by Stripe. Cancel any time from Settings.
      </Text>
    </>
  );

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            {onboarding ? null : (
              <Pressable
                style={styles.back}
                onPress={goBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather
                  name="chevron-left"
                  size={PLANS_BACK_ICON_SIZE}
                  color={colors.text}
                />
              </Pressable>
            )}
            <Text style={styles.screenTitle}>
              {onboarding ? "Pick a plan" : "Your plan"}
            </Text>
          </View>

          <View style={styles.heading}>
            <Text style={styles.subline}>
              {onboarding
                ? "Start free, or go Premium. You can change this any time in Settings."
                : "Switch plans or manage your Premium subscription."}
            </Text>
          </View>

          {checkout === "cancelled" && !isPremium ? (
            <View style={styles.notice}>
              <Feather name="info" size={PLANS_ICON_SIZE} color={colors.textMuted} />
              <Text style={styles.noticeText}>
                Checkout was cancelled - you haven't been charged.
              </Text>
            </View>
          ) : null}

          {isConfirming ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.noticeText}>Confirming your payment...</Text>
              <Pressable onPress={stopWaiting} hitSlop={8} accessibilityRole="button">
                <Text style={styles.noticeAction}>Stop</Text>
              </Pressable>
            </View>
          ) : null}

          {error ? (
            <View
              style={[styles.notice, styles.noticeError]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Feather name="alert-circle" size={PLANS_ICON_SIZE} color={colors.danger} />
              <Text style={[styles.noticeText, styles.noticeTextError]}>{error}</Text>
              <Pressable
                onPress={() => void reload()}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.noticeAction}>Check again</Text>
              </Pressable>
            </View>
          ) : null}

          {/*
            A failed load still shows the cards, as Free: in onboarding, a dead
            network must not stand between a new user and Continue with Free.
          */}
          {isLoading && subscription === undefined ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <>
              {card(PLANS.free, freeIsCurrent, freeFooter)}
              {card(PLANS.premium, isPremium, premiumFooter)}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PlanPicker;
