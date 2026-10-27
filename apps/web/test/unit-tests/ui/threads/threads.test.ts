// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from "vitest";
import { MatrixEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { isThreadReplyFallback, markRoomReadEverywhere, threadEvents, threadSummary } from "../../../../src/ui/threads/threads";

let nextId = 0;
function message(body: string, sender: string, ts: number, relatesTo?: Record<string, unknown>): MatrixEvent {
    nextId += 1;
    return new MatrixEvent({
        event_id: `$e${nextId}`,
        type: "m.room.message",
        sender,
        origin_server_ts: ts,
        room_id: "!room:hs",
        content: { msgtype: "m.text", body, ...(relatesTo ? { "m.relates_to": relatesTo } : {}) },
    });
}

function fakeRoom(main: MatrixEvent[], threads: Record<string, { root: MatrixEvent; replies: MatrixEvent[]; unread?: number }>): Room {
    const threadObjects = Object.entries(threads).map(([id, thread]) => ({
        id,
        rootEvent: thread.root,
        events: thread.replies,
        length: thread.replies.length,
        replyToEvent: thread.replies[thread.replies.length - 1] ?? null,
    }));
    return {
        roomId: "!room:hs",
        getLiveTimeline: () => ({ getEvents: () => main }),
        getThread: (id: string) => threadObjects.find((thread) => thread.id === id) ?? null,
        getThreads: () => threadObjects,
        findEventById: (id: string) => main.find((event) => event.getId() === id),
        getMember: (userId: string) => ({ name: userId === "@bot:hs" ? "Mead Bot" : userId }),
        getThreadUnreadNotificationCount: (id: string) => threads[id]?.unread ?? 0,
    } as unknown as Room;
}

describe("threads", () => {
    it("tells a thread's fallback reply apart from a real reply", () => {
        const root = message("root", "@alice:hs", 1);
        const fallback = message("in thread", "@bot:hs", 2, {
            rel_type: "m.thread",
            event_id: root.getId(),
            is_falling_back: true,
            "m.in_reply_to": { event_id: root.getId() },
        });
        const realReply = message("quoting", "@bot:hs", 3, {
            rel_type: "m.thread",
            event_id: root.getId(),
            is_falling_back: false,
            "m.in_reply_to": { event_id: fallback.getId() },
        });
        const plainReply = message("plain", "@bot:hs", 4, { "m.in_reply_to": { event_id: root.getId() } });
        expect(isThreadReplyFallback(fallback)).toBe(true);
        expect(isThreadReplyFallback(realReply)).toBe(false);
        expect(isThreadReplyFallback(plainReply)).toBe(false);
    });

    it("lists a thread starting with its first message, and summarises it", () => {
        const root = message("What goes with mead?", "@alice:hs", 1);
        const reply = message("Roast boar,\n  mostly.", "@bot:hs", 2);
        const room = fakeRoom([root], { [root.getId()!]: { root, replies: [reply], unread: 1 } });
        expect(threadEvents(room, root.getId()!).map((event) => event.getContent().body)).toEqual(["What goes with mead?", "Roast boar,\n  mostly."]);
        expect(threadSummary(room, root.getId()!)).toEqual({
            count: 1,
            lastSenderId: "@bot:hs",
            lastSenderName: "Mead Bot",
            lastBody: "Roast boar, mostly.",
            lastTs: 2,
            unread: 1,
        });
        expect(threadSummary(room, "$nothing")).toBeNull();
    });

    it("marks a room read with one unthreaded receipt on the newest event, thread replies included", async () => {
        const root = message("root", "@alice:hs", 1);
        const later = message("main, later", "@bot:hs", 2);
        const threadReply = message("newest, in a thread", "@bot:hs", 3);
        const room = fakeRoom([root, later], { [root.getId()!]: { root, replies: [threadReply] } });
        const setRoomReadMarkers = vi.fn().mockResolvedValue({});
        const sendReadReceipt = vi.fn().mockResolvedValue({});
        await markRoomReadEverywhere({ setRoomReadMarkers, sendReadReceipt } as unknown as MatrixClient, room);
        expect(setRoomReadMarkers).toHaveBeenCalledWith("!room:hs", later.getId());
        expect(sendReadReceipt).toHaveBeenCalledWith(threadReply, undefined, true);
    });
});
