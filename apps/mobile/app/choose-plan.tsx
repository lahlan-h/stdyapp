import PlanPicker from "@components/PlanPicker";

/**
 * Pick a plan, straight after creating an account - by registering, or by a
 * first Continue with Google.
 *
 * Reached by the root layout's guard rather than by navigation: while the new
 * session is choosing a plan this is the only screen that exists, and picking
 * one closes the guard and lands on the feed. See finishChoosingPlan.
 */
const ChoosePlan = () => <PlanPicker mode="onboarding" />;

export default ChoosePlan;
