// SPDX-License-Identifier: AGPL-3.0-only
// Friends, like Discord's: Matrix has none, so each person keeps their own list in account data
// (io.github.peytong.meadhall.friends, synced to all their devices) and the two sides talk through their DM: a friend
// request, accept, cancel or removal is an m.notice carrying io.github.peytong.meadhall.friend {action}. People on other
// Matrix apps just see the notice text. Each app applies the other side's notices to its own list, once (by time).
import { ClientEvent, EventType, MsgType, RoomEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { createOrReuseDirectChat, getDirectRoomIds } from "../dm/directChats";

export const FRIENDS_EVENT = "io.github.peytong.meadhall.friends";
export const FRIEND_KEY = "io.github.peytong.meadhall.friend";

export type FriendAction = "request" | "accept" | "cancel" | "remove";

export interface FriendsList {
    friends: string[];
    incoming: string[];
    outgoing: string[];
    // The newest friend notice applied, per person (older ones, e.g. from a re-sync, are skipped).
    seen: Record<string, number>;
}

export const EMPTY_FRIENDS: FriendsList = { friends: [], incoming: [], outgoing: [], seen: {} };
const MAX = 1000;

const ids = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^@[^:\s]+:\S+$/.test(id)))].slice(0, MAX) : [];

export function parseFriends(content: unknown): FriendsList {
    if (!content || typeof content !== "object") return EMPTY_FRIENDS;
    const record = content as Record<string, unknown>;
    const seen: Record<string, number> = {};
    if (record.seen && typeof record.seen === "object") {
        for (const [userId, ts] of Object.entries(record.seen as Record<string, unknown>)) if (typeof ts === "number") seen[userId] = ts;
    }
    const friends = ids(record.friends);
    return {
        friends,
        incoming: ids(record.incoming).filter((id) => !friends.includes(id)),
        outgoing: ids(record.outgoing).filter((id) => !friends.includes(id)),
        seen,
    };
}

export type FriendStatus = "none" | "friends" | "incoming" | "outgoing";

export function friendStatus(list: FriendsList, userId: string): FriendStatus {
    if (list.friends.includes(userId)) return "friends";
    if (list.incoming.includes(userId)) return "incoming";
    if (list.outgoing.includes(userId)) return "outgoing";
    return "none";
}

const without = (list: string[], userId: string): string[] => list.filter((id) => id !== userId);
const withId = (list: string[], userId: string): string[] => (list.includes(userId) ? list : [...list, userId]);

// What my list becomes when I do something.
export function applyMine(list: FriendsList, userId: string, action: FriendAction): FriendsList {
    switch (action) {
        case "request":
            return list.incoming.includes(userId) ? applyMine(list, userId, "accept") : { ...list, outgoing: withId(list.outgoing, userId) };
        case "accept":
            return { ...list, friends: withId(list.friends, userId), incoming: without(list.incoming, userId), outgoing: without(list.outgoing, userId) };
        case "cancel":
        case "remove":
            return { ...list, friends: without(list.friends, userId), incoming: without(list.incoming, userId), outgoing: without(list.outgoing, userId) };
    }
}

// What my list becomes when they did something (their notice reached me).
export function applyTheirs(list: FriendsList, userId: string, action: FriendAction, ts: number): FriendsList {
    if ((list.seen[userId] ?? 0) >= ts) return list;
    const seen = { ...list.seen, [userId]: ts };
    switch (action) {
        case "request":
            if (list.friends.includes(userId)) return { ...list, seen };
            // Both asked: that's a yes.
            if (list.outgoing.includes(userId)) return { ...applyMine(list, userId, "accept"), seen };
            return { ...list, incoming: withId(list.incoming, userId), seen };
        case "accept":
            return list.outgoing.includes(userId) ? { ...applyMine(list, userId, "accept"), seen } : { ...list, seen };
        case "cancel":
            return { ...list, incoming: without(list.incoming, userId), seen };
        case "remove":
            return { ...list, friends: without(list.friends, userId), outgoing: without(list.outgoing, userId), seen };
    }
}

export function readFriends(client: MatrixClient): FriendsList {
    return parseFriends(client.getAccountData(FRIENDS_EVENT as never)?.getContent());
}

async function saveFriends(client: MatrixClient, list: FriendsList): Promise<void> {
    await client.setAccountData(FRIENDS_EVENT as never, list as never);
}

const NOTICE: Record<FriendAction, (name: string) => string> = {
    request: (name) => `${name} sent you a friend request.`,
    accept: (name) => `${name} accepted your friend request.`,
    cancel: (name) => `${name} cancelled their friend request.`,
    remove: (name) => `${name} removed you as a friend.`,
};

// Do something, update my list, and tell them in our DM (made if needed).
export async function friendAction(client: MatrixClient, userId: string, action: FriendAction): Promise<string> {
    const before = readFriends(client);
    // A request to someone who already asked me is an accept.
    const effective: FriendAction = action === "request" && before.incoming.includes(userId) ? "accept" : action;
    const { roomId } = await createOrReuseDirectChat(client, userId);
    const me = client.getUser(client.getSafeUserId())?.displayName ?? client.getSafeUserId();
    await client.sendMessage(roomId, { msgtype: MsgType.Notice, body: NOTICE[effective](me), [FRIEND_KEY]: { action: effective } } as never);
    await saveFriends(client, applyMine(before, userId, effective));
    return roomId;
}

export function friendNotice(event: MatrixEvent): FriendAction | null {
    if (event.getType() !== EventType.RoomMessage) return null;
    const action = (event.getContent()[FRIEND_KEY] as { action?: unknown } | undefined)?.action;
    return action === "request" || action === "accept" || action === "cancel" || action === "remove" ? action : null;
}

// Applies friend notices from other people's sides (in DMs) to my list. Returns whether anything changed.
export async function applyFriendNotices(client: MatrixClient, events: Array<{ event: MatrixEvent; room: Room }>): Promise<boolean> {
    const me = client.getSafeUserId();
    const direct = getDirectRoomIds(client);
    let list = readFriends(client);
    const start = JSON.stringify(list);
    for (const { event, room } of events.sort((left, right) => left.event.getTs() - right.event.getTs())) {
        const sender = event.getSender();
        const action = friendNotice(event);
        if (!action || !sender || sender === me || !direct.has(room.roomId)) continue;
        list = applyTheirs(list, sender, action, event.getTs());
    }
    if (JSON.stringify(list) === start) return false;
    await saveFriends(client, list);
    return true;
}

// Keeps my list up to date: catches up on DMs' loaded history, then follows new notices.
export function watchFriendNotices(client: MatrixClient): () => void {
    const catchUp = (): void => {
        const direct = getDirectRoomIds(client);
        const events = client
            .getRooms()
            .filter((room) => direct.has(room.roomId))
            .flatMap((room) => room.getLiveTimeline().getEvents().map((event) => ({ event, room })));
        void applyFriendNotices(client, events).catch(() => undefined);
    };
    const onTimeline = (event: MatrixEvent, room: Room | undefined, toStart: boolean | undefined): void => {
        if (!room || toStart) return;
        void client
            .decryptEventIfNeeded(event)
            .then(() => (friendNotice(event) ? applyFriendNotices(client, [{ event, room }]) : false))
            .catch(() => undefined);
    };
    catchUp();
    client.on(RoomEvent.Timeline, onTimeline);
    const onSync = (state: string): void => {
        if (state === "PREPARED") catchUp();
    };
    client.on(ClientEvent.Sync, onSync);
    return () => {
        client.off(RoomEvent.Timeline, onTimeline);
        client.off(ClientEvent.Sync, onSync);
    };
}
