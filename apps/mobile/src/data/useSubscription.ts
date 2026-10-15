import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

/**
 * GET /api/subscriptions/me, as the service answers it - the fields this app
 * reads, not every column.
 *
 * isPremium is the server's answer and must not be recomputed here: CANCELLED
 * still means premium until renewsAt, and the service already applies that
 * rule (see toResponse in subscription.service.js).
 */
export interface Subscription {
  status: "ACTIVE" | "CANCELLED" | "EXPIRED";
  /** When the paid period ends - a renewal, or for CANCELLED, the last day. */
  renewsAt: string | null;
  isPremium: boolean;
}

export interface SubscriptionState {
  /**
   * null is the free plan - the API answers 404 for anyone who has never
   * subscribed, and the absence of a row IS the free tier. undefined until the
   * first load settles.
   */
  subscription?: Subscription | null;
  isLoading: boolean;
  /** A checkout or cancellation is in flight. */
  isWorking: boolean;
  /** Checkout has been opened and the webhook has not been seen yet. */
  isConfirming: boolean;
  error?: string;
  reload: () => Promise<void>;
  /** Opens Stripe Checkout for the premium plan. */
  startCheckout: () => Promise<void>;
  /** Watches for a payment made elsewhere - Checkout returning on web. */
  waitForPayment: () => void;
  stopWaiting: () => void;
  /** Cancels at period end. Resolves true on success. */
  cancel: () => Promise<boolean>;
}

/** How often, and how many times, to look for the webhook's write. */
const POLL_INTERVAL_MS = 3_000;
const POLL_ATTEMPTS = 20;

const NOT_CONFIRMED =
  "No payment has come through yet. If you finished checkout, it can take a " +
  "minute to appear - check again shortly.";

const fetchSubscription = async (): Promise<Subscription | null> => {
  try {
    return await withAuth((token) =>
      request<Subscription>("/api/subscriptions/me", { token }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
};

const describe = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

/**
 * The signed-in user's plan, and the two ways to change it.
 *
 * ⚠ STARTING CHECKOUT GRANTS NOTHING. POST /api/subscriptions answers a Stripe
 * Checkout URL and writes no row; premium appears only once Stripe's webhook
 * reaches the API, a moment after payment. So once Checkout reports success
 * this polls GET /me until isPremium turns up, or gives up after a minute.
 * Locally that webhook only arrives while `stripe listen` is forwarding to the
 * API.
 *
 * Checkout sends only returnUrl, and cancel nothing at all: the API rejects
 * any other field on either (see subscription.validation.js).
 */
export const useSubscription = (): SubscriptionState => {
  const [subscription, setSubscription] = useState<Subscription | null | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      setSubscription(await fetchSubscription());
      setError(undefined);
    } catch (err) {
      setError(describe(err, "Could not load your plan."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!isConfirming) return;

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const next = await fetchSubscription();
        if (cancelled) return;
        setSubscription(next);
        if (next?.isPremium) {
          setIsConfirming(false);
          return;
        }
      } catch {
        /* a blip mid-wait is not worth a red box - running out of time is */
      }
      if (cancelled) return;

      attempt += 1;
      if (attempt >= POLL_ATTEMPTS) {
        setIsConfirming(false);
        setError(NOT_CONFIRMED);
        return;
      }
      timer = setTimeout(check, POLL_INTERVAL_MS);
    };

    check();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isConfirming]);

  const waitForPayment = useCallback(() => {
    setError(undefined);
    setIsConfirming(true);
  }, []);

  const stopWaiting = useCallback(() => setIsConfirming(false), []);

  const startCheckout = useCallback(async () => {
    setIsWorking(true);
    setError(undefined);

    try {
      // Where Checkout sends a phone back to: this app's own link to /plans -
      // stdyapp://plans in a build, exp://<host>/--/plans in Expo Go. The API
      // appends ?checkout=success|cancelled. Web sends none and comes back to
      // the API's configured web URLs instead.
      const returnUrl = Platform.OS === "web" ? undefined : Linking.createURL("plans");

      const { url } = await withAuth((token) =>
        request<{ url: string }>("/api/subscriptions", {
          method: "POST",
          token,
          body: returnUrl ? { returnUrl } : {},
        }),
      );

      if (Platform.OS === "web") {
        // The same tab, not a new one: a window opened after an await is
        // popup-blocked by most browsers. Checkout comes back to
        // /plans?checkout=..., which picks the wait up from there.
        window.location.assign(url);
        return;
      }

      // An AUTH SESSION browser rather than a plain one: it closes itself the
      // instant Checkout redirects to returnUrl, so the user lands straight
      // back here instead of on a page their phone cannot load.
      //
      // Ephemeral, which skips iOS's "wants to use stripe.com to sign in"
      // prompt - this is a payment, not a sign-in. The cost is that the page
      // shares no cookies with Safari, which Checkout does not need.
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl, {
        preferEphemeralSession: true,
      });

      if (result.type === "success" && result.url.includes("checkout=success")) {
        setIsConfirming(true);
      } else {
        // Cancelled on Checkout, or the browser closed by hand. Nothing to
        // wait for, but look once in case a payment did go through.
        await reload();
      }
    } catch (err) {
      // 409: already premium, most likely from another device. Show it.
      if (err instanceof ApiError && err.status === 409) {
        await reload();
        return;
      }
      setError(describe(err, "Could not start checkout. Try again."));
    } finally {
      setIsWorking(false);
    }
  }, [reload]);

  const cancel = useCallback(async () => {
    setIsWorking(true);
    setError(undefined);

    try {
      setSubscription(
        await withAuth((token) =>
          request<Subscription>("/api/subscriptions/cancel", {
            method: "POST",
            token,
            body: {},
          }),
        ),
      );
      return true;
    } catch (err) {
      setError(describe(err, "Could not cancel your subscription. Try again."));
      return false;
    } finally {
      setIsWorking(false);
    }
  }, []);

  return {
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
  };
};
