// SPDX-License-Identifier: AGPL-3.0-only
// Mark as read and muting for channels and whole servers (spaces), like Discord's right-click menus.
//
// Muting uses Matrix push rules (roomNotificationAdapter), so it applies on every device and in Element too. A server's
// notification level is remembered in account data, so channels added to it later get the same level.
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { RoomNotificationMode, getRoomNotificationMode, setRoomNotificationMode } from "../adapters/roomNotificationAdapter";
import { markRoomReadEverywhere } from "../threads/threads";

export const SPACE_NOTIFICATIONS_TYPE = "io.github.peytong.meadhall.space_notifications";

export { RoomNotificationMode };

export function isRoomMuted(client: MatrixClient, roomId: string): boolean {
    return getRoomNotificationMode(client, roomId) === RoomNotificationMode.Mute;
}

function readSpaceModes(client: MatrixClient): Record<string, RoomNotificationMode> {
    const content = client.getAccountData(SPACE_NOTIFICATIONS_TYPE as never)?.getContent() as Record<string, unknown> | undefined;
    const modes: Record<string, RoomNotificationMode> = {};
    const valid = new Set<string>(Object.values(RoomNotificationMode));
    for (const [spaceId, mode] of Object.entries(content ?? {})) {
        if (typeof mode === "string" && valid.has(mode)) modes[spaceId] = mode as RoomNotificationMode;
    }
    return modes;
}

export function getSpaceNotificationMode(client: MatrixClient, spaceId: string): RoomNotificationMode {
    return readSpaceModes(client)[spaceId] ?? RoomNotificationMode.Default;
}

export function isSpaceMuted(client: MatrixClient, spaceId: string): boolean {
    return getSpaceNotificationMode(client, spaceId) === RoomNotificationMode.Mute;
}

// Sets the level for the server and every channel in it you've joined (one push rule each).
export async function setSpaceNotificationMode(client: MatrixClient, space: Room, channels: Room[], mode: RoomNotificationMode): Promise<void> {
    const modes = readSpaceModes(client);
    if (mode === RoomNotificationMode.Default) delete modes[space.roomId];
    else modes[space.roomId] = mode;
    await client.setAccountData(SPACE_NOTIFICATIONS_TYPE as never, modes as never);
    for (const room of [space, ...channels]) {
        if (room.getMyMembership() !== "join") continue;
        if (getRoomNotificationMode(client, room.roomId) !== mode) await setRoomNotificationMode(client, room.roomId, mode);
    }
}

// Channels joined after the server was muted (or set to mentions) get the server's level, unless set on their own.
export async function applySpaceNotificationMode(client: MatrixClient, spaceId: string, channels: Room[]): Promise<void> {
    const mode = getSpaceNotificationMode(client, spaceId);
    if (mode === RoomNotificationMode.Default) return;
    for (const room of channels) {
        if (room.getMyMembership() === "join" && getRoomNotificationMode(client, room.roomId) === RoomNotificationMode.Default) {
            await setRoomNotificationMode(client, room.roomId, mode);
        }
    }
}

// Moves the read marker to the newest message in each room, threads included. Rooms whose newest message already
// looks read are still marked when the server counts something unread (a thread reply, say), or they'd never clear.
export async function markRoomsRead(client: MatrixClient, rooms: Room[]): Promise<void> {
    const ownUserId = client.getUserId();
    if (!ownUserId) return;
    for (const room of rooms) {
        const events = room.getLiveTimeline().getEvents();
        const latestId = events[events.length - 1]?.getId();
        const looksRead = !latestId || room.hasUserReadEvent(ownUserId, latestId);
        if (looksRead && room.getUnreadNotificationCount() === 0 && !room.hasThreadUnreadNotification()) continue;
        await markRoomReadEverywhere(client, room).catch(() => undefined);
    }
}
