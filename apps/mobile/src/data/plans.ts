/**
 * The plans pick-a-plan offers, as display copy.
 *
 * ⚠ NOTHING GATES ON THESE FEATURE LISTS. They describe the tiers; no screen
 * checks isPremium before showing anything yet, so every account gets every
 * feature regardless of plan. Wire each one up before the copy promises it to
 * a paying user.
 *
 * ⚠ THE PRICE IS COPY TOO. What Stripe actually charges is STRIPE_PRICE_ID on
 * the API, and Checkout shows that real amount before anyone pays - so a stale
 * figure here misleads rather than overcharges. Change both together.
 */

export type PlanId = "free" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  /** Under the price - "forever", "per month". */
  cadence: string;
  tagline: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Everything you need to start studying with friends.",
    features: [
      "Log and share study sessions",
      "Follow friends and join study groups",
      "Routines, to-dos and streaks",
      "Weekly analytics",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: "$4.99",
    cadence: "per month",
    tagline: "For when studying is the main event.",
    features: [
      "Everything in Free",
      "Full analytics history and focus insights",
      "Unlimited study groups",
      "A Premium badge on your profile",
    ],
  },
};
