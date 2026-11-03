// SPDX-License-Identifier: AGPL-3.0-only
// Pinned messages (Matrix m.room.pinned_events, newest pin first, like Element and Discord). Pinning needs the room's
// power for that state event ("Pin messages" in Space Settings → Roles).
import { EventType, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

const MAX_PINS = 250;

export function pinnedEventIds(room: Room): string[] {
    const content = (room.currentState.getStateEvents(EventType.RoomPinnedEvents, "")?.getContent() ?? {}) as { pinned?: unknown };
    return Array.isArray(content.pinned) ? content.pinned.filter((id): id is string => typeof id === "string" && id.startsWith("$")) : [];
}

export function isPinned(room: Room, eventId: string): boolean {
    return pinnedEventIds(room).includes(eventId);
}

export function canPin(room: Room, userId: string): boolean {
    return room.currentState.maySendStateEvent(EventType.RoomPinnedEvents, userId);
}

export async function setPinned(client: MatrixClient, room: Room, eventId: string, pinned: boolean): Promise<void> {
    const current = pinnedEventIds(room).filter((id) => id !== eventId);
    const next = pinned ? [eventId, ...current].slice(0, MAX_PINS) : current;
    await client.sendStateEvent(room.roomId, EventType.RoomPinnedEvents, { pinned: next } as never, "");
}
