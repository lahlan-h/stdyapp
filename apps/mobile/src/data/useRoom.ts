import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import type { GroupPerson } from "./groupTypes";
import { subscribeRoomUpdates } from "./roomSignal";

/**
 * How long a participant may go without a sign of life before showing as away.
 * Samples arrive every 15 seconds while someone's app is open, so two minutes
 * is several missed - a locked phone or another app, not a slow network.
 */
const AWAY_AFTER_MS = 2 * 60 * 1000;

/**
 * How often the list is re-read with no event to prompt it. The socket covers
 * joins and leaves; this only moves people in and out of "away", which no
 * event announces - one per focus sample would be four a minute per person.
 */
const REFRESH_MS = 60_000;

/** One row of GET /api/sessions/:id/room. */
interface RawParticipant {
  id: string;
  startedAt: string;
  plannedMinutes: number | null;
  lastActiveAt: string;
  isMine: boolean;
  user: GroupPerson;
}

export interface RoomParticipant {
  sessionId: string;
  user: GroupPerson;
  startedAt: string;
  isMine: boolean;
  /** Quiet for a while - a locked phone or another app. Still in the room. */
  isAway: boolean;
}

export interface RoomState {
  /** Everyone still in, in the order they arrived. Undefined until loaded. */
  participants?: RoomParticipant[];
  error?: string;
}

/**
 * Who is still in the room of the given session - live.
 *
 * Re-read whenever the socket says this room changed (someone joined, ended,
 * or was closed as abandoned), on every socket reconnect, and once a minute
 * for "away". Pass null when there is no session; the hook then holds nothing.
 */
export const useRoom = (sessionId: string | null): RoomState => {
  const [participants, setParticipants] = useState<RoomParticipant[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  /** The room this session is in, as the server last said - what events name. */
  const roomIdRef = useRef<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const requestId = ++latest.current;
    try {
      const room = await withAuth((token) =>
        request<{ roomId: string; participants: RawParticipant[] }>(
          `/api/sessions/${sessionId}/room`,
          { token },
        ),
      );
      if (requestId !== latest.current) return;
      roomIdRef.current = room.roomId;
      const now = Date.now();
      setParticipants(
        room.participants.map((p) => ({
          sessionId: p.id,
          user: p.user,
          startedAt: p.startedAt,
          isMine: p.isMine,
          // Never yourself: this screen being up is proof you are here.
          isAway: !p.isMine && now - new Date(p.lastActiveAt).getTime() > AWAY_AFTER_MS,
        })),
      );
      setError(undefined);
    } catch {
      // The last list stays up; a failed refresh is not worth a banner over a
      // running session. The next event or tick tries again.
      if (requestId === latest.current) setError("Could not refresh who is here.");
    }
  }, [sessionId]);

  useEffect(() => {
    roomIdRef.current = null;
    setParticipants(undefined);
    setError(undefined);
    if (!sessionId) return;

    void load();
    const unsubscribe = subscribeRoomUpdates((roomId) => {
      if (roomId === null || roomId === roomIdRef.current) void load();
    });
    const timer = setInterval(() => void load(), REFRESH_MS);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [sessionId, load]);

  return { participants, error };
};
