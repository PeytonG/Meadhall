// SPDX-License-Identifier: AGPL-3.0-only
// matrix-js-sdk 40 syncs with MSC4222 ("state_after") and then does NOT apply state events that arrive in the
// timeline; it relies on the server's state_after list instead. When two changes to a room's state land close
// together, one of them can be missing from that list, so our copy of the room keeps the old state for good: seen as
// people "still in" a call they had left (the channel list said "2 connected" in an empty channel), and possibly
// roles, sanctions and onboarding answers that never updated.
//
// Fix: when a state event arrives in the live timeline and says it replaces exactly the event we hold for that
// type and key (unsigned.replaces_state), or it is the first one for that type and key, apply it. That chain comes
// from the server, so it can't roll state back.
// No matrix-js-sdk imports: the bot (apps/bot) runs this file too, with its own copy of the SDK. These are the few
// parts used.
interface StateEventLike {
    isState(): boolean;
    isRedacted(): boolean;
    getStateKey(): string | undefined;
    getType(): string;
    getId(): string | undefined;
    getUnsigned(): unknown;
}

interface RoomLike {
    currentState: {
        getStateEvents(type: string, key: string): StateEventLike | null;
        setStateEvents(events: never[]): void;
    };
}

interface ClientLike {
    on(event: never, listener: never): unknown;
    off(event: never, listener: never): unknown;
}

const TIMELINE_EVENT = "Room.timeline"; // RoomEvent.Timeline

export function applyMissedStateEvent(room: RoomLike, event: StateEventLike): boolean {
    if (!event.isState() || event.isRedacted()) return false;
    const key = event.getStateKey();
    if (key === undefined) return false;
    const current = room.currentState.getStateEvents(event.getType(), key);
    const replaces = (event.getUnsigned() as { replaces_state?: unknown }).replaces_state;
    if (current) {
        if (current.getId() === event.getId() || replaces !== current.getId()) return false;
    } else if (replaces !== undefined) {
        // It replaces something we never had: not ours to guess.
        return false;
    }
    // (No current event and nothing replaced: a brand-new type/key, like a channel just added to a space.)
    room.currentState.setStateEvents([event as never]);
    return true;
}

export function watchMissedStateEvents(client: ClientLike): () => void {
    const onTimeline = (event: StateEventLike, room: RoomLike | undefined, toStartOfTimeline: boolean | undefined, _removed: boolean, data?: { liveEvent?: boolean }): void => {
        if (!room || toStartOfTimeline || data?.liveEvent === false) return;
        // After the SDK has finished with this sync's state.
        queueMicrotask(() => {
            applyMissedStateEvent(room, event);
        });
    };
    client.on(TIMELINE_EVENT as never, onTimeline as never);
    return () => {
        client.off(TIMELINE_EVENT as never, onTimeline as never);
    };
}
