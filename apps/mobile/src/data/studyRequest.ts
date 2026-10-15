/**
 * A session another screen has asked the Study tab to start or join.
 *
 * The buttons live on a group's screen, pushed over the tabs, while the session
 * lives in FocusSessionProvider under the tabs - out of that screen's reach,
 * and it is the Study tab that starts and joins. So the group screen leaves
 * the request here, navigates to Study, and Study takes it when it regains
 * focus - chatRequest's one-shot shape, for chatRequest's reason.
 *
 * Only the latest request is held: tapping two Join buttons in a row joins the
 * second.
 */
export type StudyRequest =
  /** Preselect a group, so the next Start begins a group session in it. */
  | { kind: "group"; groupId: string; groupName: string }
  /** Join someone's running session straight away - its clock is already going. */
  | { kind: "join"; inviteCode: string; groupName: string };

let requested: StudyRequest | null = null;

export const requestStudySession = (next: StudyRequest): void => {
  requested = next;
};

/** The pending request, cleared as it is read - so it is acted on exactly once. */
export const consumeStudyRequest = (): StudyRequest | null => {
  const next = requested;
  requested = null;
  return next;
};
