import { createContext, useContext, type ReactNode } from "react";

import { useFocusSessionState, type FocusSessionState } from "./useFocusSession";

const FocusSessionContext = createContext<FocusSessionState | null>(null);

/**
 * Holds the ONE study session for everything under the tabs.
 *
 * It used to live inside the Study screen, which was fine while only that
 * screen showed it. Now the floating session bar shows it on every tab, so the
 * state sits above the tabs and both read the same instance - two copies of
 * the hook would be two clocks, two samplers and two answers to "is a session
 * running".
 *
 * Mounted by the tabs layout, which exists exactly as long as someone is signed
 * in, so the session's timers stop on sign-out rather than outliving it.
 */
export const FocusSessionProvider = ({ children }: { children: ReactNode }) => {
  const session = useFocusSessionState();
  return <FocusSessionContext.Provider value={session}>{children}</FocusSessionContext.Provider>;
};

/** The running (or idle) study session. Only valid under FocusSessionProvider. */
export const useFocusSession = (): FocusSessionState => {
  const session = useContext(FocusSessionContext);
  if (!session) {
    // A screen outside the tabs - a modal pushed on the root stack - has no
    // provider above it. Failing loudly beats starting a second session.
    throw new Error("useFocusSession() needs FocusSessionProvider above it.");
  }
  return session;
};
