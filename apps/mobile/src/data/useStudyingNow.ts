import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { request } from "./api";
import { withAuth } from "./auth";
import { describeGroupError } from "./groupTypes";

/**
 * How often the strip is re-read while it is on screen.
 *
 * Nothing announces a session starting or ending to the people in its
 * members' groups - those writes live in another feature, and a socket event
 * per group per session would be a broadcast nobody asked for - so this polls.
 * Thirty seconds is the sample cadence doubled: quick enough that someone who
 * starts studying shows up while you are still looking, slow enough to be one
 * small read a minute per person with the feed open.
 */
const REFRESH_MS = 30_000;

/** One row of GET /api/groups/:id/studying. */
interface RawStudyingMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  startedAt: string;
  plannedMinutes: number | null;
  studyingHere: boolean;
  isMine: boolean;
}

/** A group member in a study session right now - any session. */
export interface StudyingMember {
  userId: string;
  username: string;
  /** First and last name, or null - fall back to the username. */
  displayName: string | null;
  avatarUrl: string | null;
  startedAt: Date;
  /** The length they set out to study, or null for an open-ended session. */
  plannedMinutes: number | null;
  /** In one of this group's rooms, rather than studying on their own. */
  studyingHere: boolean;
  isMine: boolean;
}

export interface StudyingNowState {
  /** Undefined until the first read lands. The viewer, when studying, is first. */
  people?: StudyingMember[];
  error?: string;
  reload: () => void;
}

/**
 * Who in a study group is studying right now, kept fresh while it is shown.
 *
 * `active` is the screen's say in it: false while the group's feed is not the
 * one on screen, or Home is not the tab, so nothing polls for a strip nobody
 * can see. It also pauses while the app is in the background, and catches up
 * the moment it returns. Pass null for no group; the hook then holds nothing.
 */
export const useStudyingNow = (groupId: string | null, active: boolean): StudyingNowState => {
  const [people, setPeople] = useState<StudyingMember[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!groupId) return;
    const requestId = ++latest.current;
    try {
      const rows = await withAuth((token) =>
        request<RawStudyingMember[]>(`/api/groups/${groupId}/studying`, { token }),
      );
      if (requestId !== latest.current) return;
      setPeople(rows.map((row) => ({ ...row, startedAt: new Date(row.startedAt) })));
      setError(undefined);
    } catch (err) {
      // The last strip stays up through a failed refresh: a stale "42m" is
      // more use than a blank row. Only a first read that fails says so.
      if (requestId === latest.current) {
        setError(describeGroupError(err, "Could not see who is studying."));
      }
    }
  }, [groupId]);

  // A different group is a different strip: forget the last one's people
  // rather than showing them under the new group's name until the read lands.
  useEffect(() => {
    latest.current += 1;
    setPeople(undefined);
    setError(undefined);
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !active) return;

    void load();
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => void load(), REFRESH_MS);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void load();
        timer ??= setInterval(() => void load(), REFRESH_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      if (timer) clearInterval(timer);
      subscription.remove();
    };
  }, [groupId, active, load]);

  return { people, error, reload: load };
};
