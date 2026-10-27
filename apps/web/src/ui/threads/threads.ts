// SPDX-License-Identifier: AGPL-3.0-only
// Threads (m.thread): replies that hang off one message, shown Discord-style as "N replies" under it and opened in a
// side panel. The client starts with threadSupport, so the SDK moves thread replies out of the main timeline into
// per-thread timelines; everything that reads messages or marks them read has to look in those too.
import {
    NotificationCountType,
    THREAD_RELATION_TYPE,
    type MatrixClient,
    type MatrixEvent,
    type Room,
    type Thread,
} from "matrix-js-sdk/src/matrix";

export function getOrCreateThread(room: Room, rootId: string): Thread | null {
    const existing = room.getThread(rootId);
    if (existing) return existing;
    const rootEvent = room.findEventById(rootId);
    if (!rootEvent) return null;
    return room.createThread(rootId, rootEvent, [], true);
}

// The thread's messages, starting with the message it hangs off.
export function threadEvents(room: Room, rootId: string): MatrixEvent[] {
    const thread = room.getThread(rootId);
    const events = thread?.events ?? [];
    if (events.some((event) => event.getId() === rootId)) return events;
    const root = thread?.rootEvent ?? room.findEventById(rootId);
    return root ? [root, ...events] : events;
}

// In a thread, m.in_reply_to usually just points at the previous message so older clients can show something
// (is_falling_back); only a real reply should show the "replying to" line.
export function isThreadReplyFallback(event: MatrixEvent): boolean {
    const relation = event.getWireContent()["m.relates_to"] as { rel_type?: unknown; is_falling_back?: unknown } | undefined;
    return THREAD_RELATION_TYPE.matches(String(relation?.rel_type ?? "")) && relation?.is_falling_back === true;
}

export interface ThreadSummary {
    count: number;
    lastSenderId: string | null;
    lastSenderName: string | null;
    lastBody: string | null;
    lastTs: number | null;
    unread: number;
}

function previewBody(event: MatrixEvent | null): string | null {
    if (!event) return null;
    if (event.isRedacted()) return "Message deleted";
    const body = event.getContent().body;
    if (typeof body !== "string") return null;
    return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function threadSummary(room: Room, rootId: string): ThreadSummary | null {
    const thread = room.getThread(rootId);
    if (!thread || thread.length === 0) return null;
    const last = thread.replyToEvent;
    const lastSenderId = last?.getSender() ?? null;
    return {
        count: thread.length,
        lastSenderId,
        lastSenderName: lastSenderId ? (room.getMember(lastSenderId)?.name ?? lastSenderId) : null,
        lastBody: previewBody(last),
        lastTs: last?.getTs() ?? null,
        unread: room.getThreadUnreadNotificationCount(rootId, NotificationCountType.Total) ?? 0,
    };
}

// The newest event the server sent in the room, main timeline or any thread.
function newestEvent(room: Room): MatrixEvent | null {
    const candidates: MatrixEvent[] = [];
    const main = room.getLiveTimeline().getEvents();
    const mainLatest = [...main].reverse().find((event) => event.getId()?.startsWith("$"));
    if (mainLatest) candidates.push(mainLatest);
    for (const thread of room.getThreads()) {
        const latest = [...thread.events].reverse().find((event) => event.getId()?.startsWith("$"));
        if (latest) candidates.push(latest);
    }
    return candidates.reduce<MatrixEvent | null>((best, event) => (!best || event.getTs() > best.getTs() ? event : best), null);
}

// "Mark as read" for a whole conversation, threads included: one unthreaded receipt on the newest event covers every
// event before it, in the main timeline and in threads (a main-timeline receipt alone leaves thread replies unread).
export async function markRoomReadEverywhere(client: MatrixClient, room: Room): Promise<void> {
    const latest = newestEvent(room);
    const mainLatest = [...room.getLiveTimeline().getEvents()].reverse().find((event) => event.getId()?.startsWith("$"));
    const mainLatestId = mainLatest?.getId();
    if (mainLatest && mainLatestId) {
        await client.setRoomReadMarkers(room.roomId, mainLatestId).catch(() => undefined);
    }
    if (latest) await client.sendReadReceipt(latest, undefined, true);
}
