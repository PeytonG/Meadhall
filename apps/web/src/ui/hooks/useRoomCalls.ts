// SPDX-License-Identifier: AGPL-3.0-only
// Who is in each room's MatrixRTC call (Meadhall and Element Call share these memberships), updated live.
import { useEffect, useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/src/matrixrtc";

function readCallMembers(client: MatrixClient, room: Room): string[] {
    const session = client.matrixRTC?.getRoomSession(room);
    if (!session) {
        return [];
    }
    return [...new Set(session.memberships.map((membership) => membership.userId))];
}

function sameMembers(left: string[] | undefined, right: string[]): boolean {
    return Boolean(left) && left!.length === right.length && left!.every((userId, index) => userId === right[index]);
}

// Map of roomId -> user IDs currently in that room's call. Rooms without a call are left out.
export function useRoomCalls(client: MatrixClient, rooms: Room[]): Map<string, string[]> {
    const [calls, setCalls] = useState<Map<string, string[]>>(new Map());
    const roomKey = useMemo(() => rooms.map((room) => room.roomId).join("\u0000"), [rooms]);

    useEffect(() => {
        if (!client.matrixRTC) {
            return undefined;
        }
        const refresh = (): void => {
            setCalls((current) => {
                const next = new Map<string, string[]>();
                for (const room of rooms) {
                    const members = readCallMembers(client, room);
                    if (members.length > 0) {
                        next.set(room.roomId, sameMembers(current.get(room.roomId), members) ? current.get(room.roomId)! : members);
                    }
                }
                const unchanged =
                    next.size === current.size && [...next].every(([roomId, members]) => current.get(roomId) === members);
                return unchanged ? current : next;
            });
        };

        const sessions = rooms.map((room) => client.matrixRTC.getRoomSession(room));
        for (const session of sessions) {
            session.on(MatrixRTCSessionEvent.MembershipsChanged, refresh);
        }
        refresh();
        return () => {
            for (const session of sessions) {
                session.off(MatrixRTCSessionEvent.MembershipsChanged, refresh);
            }
        };
        // roomKey stands in for `rooms`, whose array identity changes on every sync.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, roomKey]);

    return calls;
}
