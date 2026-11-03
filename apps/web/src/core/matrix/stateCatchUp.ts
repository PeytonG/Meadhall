// SPDX-License-Identifier: AGPL-3.0-only
// matrix-js-sdk 40 syncs with MSC4222 ("state_after") and then does NOT apply state events that arrive in the
// timeline; it relies on the server's state_after list instead. When two changes to a room's state land close
// together, one of them can be missing from that list, so our copy of the room keeps the old state for good: seen as
// people "still in" a call they had left (the channel list said "2 connected" in an empty channel), and possibly
// roles, sanctions and onboarding answers that never updated.
//
// Fix: when a state event arrives in the live timeline and says it replaces exactly the event we hold for that
// type and key (unsigned.replaces_state), apply it. That chain comes from the server, so it can't roll state back.
import { RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

export function applyMissedStateEvent(room: Room, event: MatrixEvent): boolean {
    if (!event.isState() || event.isRedacted()) return false;
    const key = event.getStateKey();
    if (key === undefined) return false;
    const current = room.currentState.getStateEvents(event.getType(), key);
    if (!current || current.getId() === event.getId()) return false;
    const replaces = (event.getUnsigned() as { replaces_state?: unknown }).replaces_state;
    if (replaces !== current.getId()) return false;
    room.currentState.setStateEvents([event]);
    return true;
}

export function watchMissedStateEvents(client: MatrixClient): () => void {
    const onTimeline = (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined, _removed: boolean, data?: { liveEvent?: boolean }): void => {
        if (!room || toStartOfTimeline || data?.liveEvent === false) return;
        // After the SDK has finished with this sync's state.
        queueMicrotask(() => {
            applyMissedStateEvent(room, event);
        });
    };
    client.on(RoomEvent.Timeline, onTimeline);
    return () => {
        client.off(RoomEvent.Timeline, onTimeline);
    };
}
