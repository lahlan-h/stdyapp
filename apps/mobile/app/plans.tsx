import { useLocalSearchParams } from "expo-router";

import PlanPicker from "@components/PlanPicker";

/**
 * Your plan, from Settings' Manage subscription.
 *
 * Also where Stripe Checkout returns to on web, as ?checkout=success or
 * ?checkout=cancelled - the API's default success and cancel URLs, see
 * config/stripe.js. Anything else in that parameter is ignored.
 */
const Plans = () => {
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  return (
    <PlanPicker
      mode="manage"
      checkout={
        checkout === "success" || checkout === "cancelled" ? checkout : undefined
      }
    />
  );
};

export default Plans;
