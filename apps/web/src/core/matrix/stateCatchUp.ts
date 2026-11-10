// SPDX-License-Identifier: AGPL-3.0-only
// matrix-js-sdk 40 syncs with MSC4222 ("state_after") and then does NOT apply state events that arrive in the
// timeline; it relies on the server's state_after list instead. When two changes to a room's state land close
// together, one of them can be missing from that list, so our copy of the room keeps the old state for good: seen as
// people "still in" a call they had left (the channel list said "2 connected" in an empty channel), and possibly
// roles, sanctions and onboarding answers that never updated.
//
// Fix: when a state event arrives in the live timeline and says it replaces exactly the event we hold for that
// type and key (unsigned.replaces_state), or it is the first one for that type and key, apply it. That chain comes
// from the server, so it can't roll state back. When the chain is broken (it replaces an event we never got: an
// earlier change was lost too, like a call membership refresh), ask the server for that entry's current event
// (`refetch`) and apply what it says, so one lost change can't leave someone "in" a call for good.
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
    roomId?: string;
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

// The server's current event for one state entry (null: none). The app passes one; the bot doesn't need it.
export type RefetchState = (roomId: string, type: string, stateKey: string) => Promise<StateEventLike | null>;

// Whether the event we hold is out of step with this one: it replaces an event we never had.
function chainBroken(current: StateEventLike | null, event: StateEventLike): boolean {
    const replaces = (event.getUnsigned() as { replaces_state?: unknown }).replaces_state;
    if (typeof replaces !== "string") return false;
    return current ? current.getId() !== event.getId() && replaces !== current.getId() : true;
}

export async function refetchBrokenState(room: RoomLike, event: StateEventLike, refetch: RefetchState): Promise<boolean> {
    const key = event.getStateKey();
    if (!room.roomId || key === undefined || !event.isState()) return false;
    if (!chainBroken(room.currentState.getStateEvents(event.getType(), key), event)) return false;
    const fresh = await refetch(room.roomId, event.getType(), key).catch(() => null);
    const now = room.currentState.getStateEvents(event.getType(), key);
    if (!fresh || fresh.getId() === now?.getId()) return false;
    room.currentState.setStateEvents([fresh as never]);
    return true;
}

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

const SYNC_EVENT = "sync"; // ClientEvent.Sync: emitted once a sync response has been fully processed

export function watchMissedStateEvents(client: ClientLike, refetch?: RefetchState): () => void {
    // Checked once the SDK has finished the sync that brought them: it sets the room's state from the server's
    // state_after list after it has emitted the timeline events, so applying one sooner was overwritten by that list
    // (seen as someone still "in" a call they had left, when two people left close together).
    let pending: Array<{ room: RoomLike; event: StateEventLike }> = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
        const batch = pending;
        pending = [];
        for (const { room, event } of batch) {
            if (!applyMissedStateEvent(room, event) && refetch) void refetchBrokenState(room, event, refetch);
        }
    };
    const onTimeline = (event: StateEventLike, room: RoomLike | undefined, toStartOfTimeline: boolean | undefined, _removed: boolean, data?: { liveEvent?: boolean }): void => {
        if (!room || toStartOfTimeline || data?.liveEvent === false || !event.isState()) return;
        pending.push({ room, event });
        // In case no "sync" event follows (the bot's SDK, or a sync that failed part-way).
        timer ??= setTimeout(check, 1_000);
    };
    const onSync = (): void => {
        if (pending.length) setTimeout(check, 0);
    };
    client.on(TIMELINE_EVENT as never, onTimeline as never);
    client.on(SYNC_EVENT as never, onSync as never);
    return () => {
        client.off(TIMELINE_EVENT as never, onTimeline as never);
        client.off(SYNC_EVENT as never, onSync as never);
        if (timer) clearTimeout(timer);
    };
}
