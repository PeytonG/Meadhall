// SPDX-License-Identifier: AGPL-3.0-only
// The inbox: messages you haven't read yet, per conversation (muted ones left out), newest conversation first.
import { EventType, NotificationCountType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

export interface UnreadMessage {
    eventId: string;
    sender: string;
    senderName: string;
    body: string;
    ts: number;
    mentionsMe: boolean;
}

export interface UnreadConversation {
    room: Room;
    messages: UnreadMessage[];
    // Messages counted by the server, which can be more than the ones loaded here.
    count: number;
    mentions: number;
}

const PER_ROOM = 5;

function messageBody(event: MatrixEvent): string | null {
    if (event.isRedacted()) return null;
    const type = event.getType();
    if (type !== EventType.RoomMessage && type !== EventType.Sticker) return null;
    const content = event.getContent();
    if (type === EventType.Sticker) return "Sticker";
    if (typeof content.body !== "string") return null;
    switch (content.msgtype) {
        case "m.image":
            return "Picture";
        case "m.video":
            return "Video";
        case "m.audio":
            return "Voice message";
        case "m.file":
            return `File: ${content.body}`;
        default:
            return content.body;
    }
}

function mentions(client: MatrixClient, event: MatrixEvent): boolean {
    return Boolean(client.getPushActionsForEvent(event)?.tweaks?.highlight);
}

export function unreadConversations(client: MatrixClient, rooms: Room[], isMuted: (roomId: string) => boolean): UnreadConversation[] {
    const ownUserId = client.getUserId();
    if (!ownUserId) return [];
    const result: UnreadConversation[] = [];
    for (const room of rooms) {
        if (room.isSpaceRoom() || room.getMyMembership() !== "join" || isMuted(room.roomId)) continue;
        const events = room.getLiveTimeline().getEvents();
        const readUpTo = room.getEventReadUpTo(ownUserId);
        const readIndex = readUpTo ? events.findIndex((event) => event.getId() === readUpTo) : -1;
        const unread = events
            .slice(readIndex + 1)
            .filter((event) => event.getSender() !== ownUserId)
            .flatMap((event): UnreadMessage[] => {
                const body = messageBody(event);
                const eventId = event.getId();
                if (body === null || !eventId) return [];
                const sender = event.getSender() ?? "";
                return [{ eventId, sender, senderName: room.getMember(sender)?.name ?? sender, body, ts: event.getTs(), mentionsMe: mentions(client, event) }];
            });
        const count = room.getUnreadNotificationCount() ?? 0;
        // Without a read marker in the loaded history, trust the server's count (old rooms would otherwise look unread).
        if (count === 0 && (unread.length === 0 || readIndex < 0)) continue;
        result.push({
            room,
            messages: unread.slice(-PER_ROOM),
            count: Math.max(count, unread.length),
            mentions: Math.max(room.getUnreadNotificationCount(NotificationCountType.Highlight) ?? 0, unread.filter((message) => message.mentionsMe).length),
        });
    }
    const newest = (conversation: UnreadConversation): number => conversation.messages[conversation.messages.length - 1]?.ts ?? conversation.room.getLastActiveTimestamp();
    return result.sort((left, right) => newest(right) - newest(left));
}
