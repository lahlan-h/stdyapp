import type { UserSummary } from "./userSummary";

/**
 * A chat another screen has asked the Home screen to open.
 *
 * The Message button lives on someone's profile, a screen pushed over the tabs,
 * while chats live in Home's drop-down page. So the profile leaves the request
 * here, pops back to Home, and Home takes it when it regains focus - the same
 * one-shot shape as feedSignal, and for the same reason: there is exactly one
 * Home screen, and a context provider would be ceremony around one value.
 *
 * Holds a person rather than a flag, and only the latest one: tapping Message
 * on two profiles in a row opens the second.
 */
let requested: UserSummary | null = null;

export const requestChat = (user: UserSummary): void => {
  requested = user;
};

/** The pending request, cleared as it is read - so it is acted on exactly once. */
export const consumeChatRequest = (): UserSummary | null => {
  const user = requested;
  requested = null;
  return user;
};
