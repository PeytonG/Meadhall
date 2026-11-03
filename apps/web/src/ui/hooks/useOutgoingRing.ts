// SPDX-License-Identifier: AGPL-3.0-only
// The caller's side of a ringing DM or group call, like Discord: while the others haven't joined, they show as
// "Ringing…" and the caller hears the ring, until they join, decline (MSC4310 decline event), or the ring times out
// (the same 30 s the call notification lasts). Calls in a space's channels never ring.
import { useEffect, useMemo, useRef, useState } from "react";
import { EventType, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { startRinging } from "../voice/ringtone";

export const RING_TIMEOUT_MS = 30_000;

export type RingState = "ringing" | "declined" | "no-answer";

export function useOutgoingRing(options: {
    client: MatrixClient;
    // The call you're in, when it's one that rings (a DM or group chat), else null.
    roomId: string | null;
    // Who is in each room's call right now.
    roomCalls: Map<string, string[]>;
    playTone: boolean;
    speakerId?: string;
}): Array<{ userId: string; state: RingState }> {
    const { client, roomId, roomCalls, playTone, speakerId } = options;
    const me = client.getUserId() ?? "";
    // A ring starts when you're the only one in the call; who it rings, and since when.
    const [ring, setRing] = useState<{ roomId: string; startedAt: number; targets: string[] } | null>(null);
    const [declined, setDeclined] = useState<Set<string>>(new Set());
    const [timedOut, setTimedOut] = useState(false);
    const othersInCall = useMemo(() => (roomId ? (roomCalls.get(roomId) ?? []).filter((userId) => userId !== me) : []), [me, roomCalls, roomId]);
    const startedForRef = useRef<string | null>(null);

    useEffect(() => {
        if (!roomId) {
            startedForRef.current = null;
            setRing(null);
            return;
        }
        if (startedForRef.current === roomId) return;
        startedForRef.current = roomId;
        // Joining a call others are already in doesn't ring anyone.
        if (othersInCall.length > 0) {
            setRing(null);
            return;
        }
        const room: Room | null = client.getRoom(roomId);
        const targets = (room?.getJoinedMembers() ?? []).map((member) => member.userId).filter((userId) => userId !== me);
        setDeclined(new Set());
        setTimedOut(false);
        setRing(targets.length ? { roomId, startedAt: Date.now(), targets } : null);
    }, [client, me, othersInCall.length, roomId]);

    // Declines for this ring.
    useEffect(() => {
        if (!ring) return undefined;
        const onTimeline = (event: MatrixEvent, room: Room | undefined): void => {
            if (room?.roomId !== ring.roomId || event.getType() !== EventType.RTCDecline) return;
            const sender = event.getSender();
            if (!sender || !ring.targets.includes(sender) || event.getTs() < ring.startedAt - 5_000) return;
            setDeclined((current) => new Set([...current, sender]));
        };
        client.on(RoomEvent.Timeline, onTimeline);
        const timer = window.setTimeout(() => setTimedOut(true), Math.max(0, ring.startedAt + RING_TIMEOUT_MS - Date.now()));
        return () => {
            client.off(RoomEvent.Timeline, onTimeline);
            window.clearTimeout(timer);
        };
    }, [client, ring]);

    const people = useMemo(() => {
        if (!ring) return [];
        return ring.targets
            .filter((userId) => !othersInCall.includes(userId))
            .map((userId) => ({ userId, state: (declined.has(userId) ? "declined" : timedOut ? "no-answer" : "ringing") as RingState }));
    }, [declined, othersInCall, ring, timedOut]);

    // Someone answered: the ring is over for everyone (as in Discord, the others can still join).
    const answered = Boolean(ring) && othersInCall.length > 0;
    const stillRinging = !answered && people.some((person) => person.state === "ringing");
    useEffect(() => {
        if (!stillRinging || !playTone) return undefined;
        return startRinging(speakerId);
    }, [playTone, speakerId, stillRinging]);

    return answered ? [] : people;
}

// The callee declines: tells the caller's app (and Element) so it stops ringing for you.
export async function declineCall(client: MatrixClient, roomId: string, notificationEventId: string): Promise<void> {
    await client.sendEvent(roomId, EventType.RTCDecline as never, { "m.relates_to": { rel_type: "m.reference", event_id: notificationEventId } } as never);
}
