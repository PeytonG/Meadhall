// SPDX-License-Identifier: AGPL-3.0-only
// Incoming calls: someone else started a call in one of your DMs or group chats and sent the MatrixRTC call
// notification (Meadhall and Element both do). Rings until you join or dismiss it, the call empties, or the
// notification's lifetime runs out. Old notifications replayed at startup never ring.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventType, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

const DEFAULT_LIFETIME_MS = 30_000;
const MAX_LIFETIME_MS = 90_000;

export interface IncomingCall {
    roomId: string;
    callerId: string;
    expiresAt: number;
    eventId: string;
}

interface NotificationContent {
    sender_ts?: unknown;
    lifetime?: unknown;
}

// When a call notification stops ringing, or null if it shouldn't ring at all.
export function incomingCallExpiry(event: MatrixEvent, now: number): number | null {
    const content = event.getContent() as NotificationContent;
    const sentAt = typeof content.sender_ts === "number" ? content.sender_ts : event.getTs();
    const lifetime =
        typeof content.lifetime === "number" && content.lifetime > 0 ? Math.min(content.lifetime, MAX_LIFETIME_MS) : DEFAULT_LIFETIME_MS;
    const expiresAt = Math.min(sentAt, event.getTs()) + lifetime;
    return expiresAt > now ? expiresAt : null;
}

export function useIncomingCall(options: {
    client: MatrixClient;
    // Rooms where a call should ring (DMs, group chats): voice channels never ring.
    ringableRoomIds: ReadonlySet<string>;
    // Who is in each room's call right now.
    roomCalls: Map<string, string[]>;
    // The room whose call you're in (or joining), if any.
    currentCallRoomId: string | null;
}): { incoming: IncomingCall | null; dismiss: () => void } {
    const { client, ringableRoomIds, roomCalls, currentCallRoomId } = options;
    const [incoming, setIncoming] = useState<IncomingCall | null>(null);
    const ringableRef = useRef(ringableRoomIds);
    ringableRef.current = ringableRoomIds;
    const dismissedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const ownUserId = client.getUserId();
        const onTimeline = (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined): void => {
            const type = event.getType();
            if (toStartOfTimeline || !room || (type !== EventType.RTCNotification && type !== EventType.CallNotify)) {
                return;
            }
            const callerId = event.getSender();
            const eventId = event.getId();
            if (!callerId || callerId === ownUserId || !eventId || !ringableRef.current.has(room.roomId)) {
                return;
            }
            const expiresAt = incomingCallExpiry(event, Date.now());
            if (expiresAt === null || dismissedRef.current.has(eventId)) {
                return;
            }
            setIncoming({ roomId: room.roomId, callerId, expiresAt, eventId });
        };
        client.on(RoomEvent.Timeline, onTimeline);
        return () => {
            client.removeListener(RoomEvent.Timeline, onTimeline);
        };
    }, [client]);

    const dismiss = useCallback((): void => {
        setIncoming((current) => {
            if (current) {
                dismissedRef.current.add(current.eventId);
            }
            return null;
        });
    }, []);

    // Stop ringing when you join, the caller hangs up (nobody left in the call), or the lifetime runs out.
    const callMembers = incoming ? roomCalls.get(incoming.roomId) : undefined;
    useEffect(() => {
        if (!incoming) {
            return undefined;
        }
        if (currentCallRoomId === incoming.roomId) {
            setIncoming(null);
            return undefined;
        }
        const timer = window.setTimeout(() => setIncoming(null), Math.max(0, incoming.expiresAt - Date.now()));
        return () => window.clearTimeout(timer);
    }, [currentCallRoomId, incoming]);
    const hadMembersRef = useRef(false);
    useEffect(() => {
        if (!incoming) {
            hadMembersRef.current = false;
            return;
        }
        if (callMembers && callMembers.length > 0) {
            hadMembersRef.current = true;
        } else if (hadMembersRef.current) {
            setIncoming(null); // the caller left before anyone answered
        }
    }, [callMembers, incoming]);

    return useMemo(() => ({ incoming, dismiss }), [dismiss, incoming]);
}
