/**
 * "This room's line-up changed", from the notification socket to whichever
 * screen is showing a room.
 *
 * A listener set rather than a store, because the socket carries changes and
 * not state: each listener re-reads GET /api/sessions/:id/room for itself, so
 * all this has to say is which room moved.
 *
 * `null` means "every room": the socket emits it on (re)connect, when events
 * may have been missed while there was no connection.
 */
type Listener = (roomId: string | null) => void;

const listeners = new Set<Listener>();

export const emitRoomUpdate = (roomId: string | null): void => {
  for (const listener of listeners) listener(roomId);
};

/** Returns the way to stop listening. */
export const subscribeRoomUpdates = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
