import { ApiError } from "./api";

/**
 * Shared by useGroups and useGroup: the shapes the screens see, and the wording
 * for a failed request.
 *
 * Screens never see `_count` - the hooks map it to `memberCount` - for the seam
 * rule in src/data/index.ts.
 */

/** Mirrors MAX_NAME_LENGTH in studyGroup.validation.js. */
export const MAX_GROUP_NAME_LENGTH = 100;

/** Mirrors MAX_DESCRIPTION_LENGTH in studyGroup.validation.js. */
export const MAX_GROUP_DESCRIPTION_LENGTH = 500;

/** Mirrors MAX_JOIN_CODE_LENGTH in studyGroup.validation.js. */
export const MAX_JOIN_CODE_LENGTH = 16;

/**
 * Every code the API generates is this long - JOIN_CODE_LENGTH in
 * apps/api/src/services/joinCode.js - so the Study tab draws exactly this
 * many boxes, and a full row is a whole code.
 */
export const JOIN_CODE_LENGTH = 6;

/**
 * What a box row takes from the keyboard or a paste: letters and digits only,
 * upper-cased, at most a code's length. The dash or space someone pastes in
 * "K3P-Q7X" simply falls away, which is also what the API does with it.
 */
export const cleanJoinCodeInput = (input: string): string =>
  input
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, JOIN_CODE_LENGTH);

export type GroupRole = "MEMBER" | "ADMIN";

/** A group as every group route answers it, with the viewer's standing in it. */
export interface StudyGroup {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  /**
   * The six characters that let anyone into the group. Present for members,
   * who can share it; the API strips it for everyone else.
   */
  joinCode?: string;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  /** Null when the viewer is not a member. */
  role: GroupRole | null;
}

/** The wire shape, before `_count` is mapped away. */
export interface RawGroup extends Omit<StudyGroup, "memberCount"> {
  _count: { memberships: number };
}

export const toGroup = ({ _count, ...group }: RawGroup): StudyGroup => ({
  ...group,
  memberCount: _count.memberships,
});

export interface GroupPerson {
  id: string;
  username: string;
  avatarUrl: string | null;
}

/** One row of GET /api/groups/:id/members. */
export interface GroupMember {
  userId: string;
  role: GroupRole;
  joinedAt: string;
  user: GroupPerson;
}

/** One row of GET /api/groups/:id/sessions - someone studying right now. */
export interface LiveSession {
  id: string;
  /** What POST /api/sessions/join takes. */
  inviteCode: string;
  /**
   * The room this session joined - the id of the room's first session - or
   * null when this session IS the first. Sessions sharing a room are studying
   * together.
   */
  hostSessionId: string | null;
  startedAt: string;
  plannedMinutes: number | null;
  user: GroupPerson;
  /** The viewer's own session - nothing to join. */
  isMine: boolean;
}

/** Turns a failed group request into a sentence for the screen. */
export const describeGroupError = (err: unknown, fallback: string): string => {
  if (!(err instanceof ApiError)) return fallback;

  switch (err.status) {
    case 404:
      return "This group no longer exists.";
    case 429:
      return err.retryAfter
        ? `Slow down a little. Try again in ${err.retryAfter}s.`
        : "Slow down a little. Try again shortly.";
    default:
      // 403 and 409 carry the API's own reason - "Incorrect join code",
      // "Already a member" - which is more use than anything generic here.
      return err.message || fallback;
  }
};
