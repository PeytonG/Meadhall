// SPDX-License-Identifier: AGPL-3.0-only
// A number that changes whenever state (roles, power levels, names...) changes in any of these rooms, to re-read it.
import { useEffect, useState } from "react";
import { RoomStateEvent, type Room } from "matrix-js-sdk/src/matrix";

export function useRoomStateVersion(rooms: Room[]): number {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = (): void => setVersion((value) => value + 1);
        for (const room of rooms) room.currentState.on(RoomStateEvent.Events, bump);
        return () => {
            for (const room of rooms) room.currentState.removeListener(RoomStateEvent.Events, bump);
        };
    }, [rooms]);
    return version;
}
