// SPDX-License-Identifier: AGPL-3.0-only
// Shared notes live in a companion room per DM, group chat or space (the "notes room"), linked from the parent with a
// state event, so the notes' edits never fill the chat and load quickly. Meadhall hides notes rooms from room lists
// and mutes them (two-person encrypted rooms would otherwise notify on every edit).
//
// - DMs and group chats: a private room inviting the same people, encrypted when the chat is.
// - Spaces: anyone in the space can join (restricted join rule) and edit. Unencrypted, like most space channels:
//   people who join later couldn't decrypt older edits.
import {
    ClientEvent,
    ConditionKind,
    EventType,
    JoinRule,
    Preset,
    PushRuleActionName,
    PushRuleKind,
    RoomEvent,
    type MatrixClient,
    type Room,
} from "matrix-js-sdk/src/matrix";

export const NOTES_ROOM_TYPE = "io.github.peytong.meadhall.notes";
// In the parent room: { room_id, via: [server] }.
export const NOTES_LINK_EVENT = "io.github.peytong.meadhall.notes_room";

export function isNotesRoom(room: Room): boolean {
    return room.currentState.getStateEvents(EventType.RoomCreate, "")?.getContent()?.type === NOTES_ROOM_TYPE;
}

function linkOf(parent: Room): { roomId: string; via: string[] } | null {
    const content = parent.currentState.getStateEvents(NOTES_LINK_EVENT as never, "")?.getContent() as
        | { room_id?: unknown; via?: unknown }
        | undefined;
    if (typeof content?.room_id !== "string") return null;
    const via = Array.isArray(content.via) ? content.via.filter((server): server is string => typeof server === "string") : [];
    return { roomId: content.room_id, via };
}

export function hasNotes(parent: Room): boolean {
    return Boolean(linkOf(parent));
}

// Whether this person can set notes up here (it writes a state event in the parent).
export function canCreateNotes(client: MatrixClient, parent: Room): boolean {
    return parent.currentState.maySendStateEvent(NOTES_LINK_EVENT, client.getSafeUserId());
}

function serverOf(userId: string): string {
    return userId.slice(userId.indexOf(":") + 1);
}

// Muted for this account (the notes room never notifies; Meadhall shows edits in the notes view instead).
async function muteNotesRoom(client: MatrixClient, roomId: string): Promise<void> {
    const existing = client.pushRules?.global?.override?.some((rule) => rule.rule_id === roomId);
    if (existing) return;
    await client
        .addPushRule("global", PushRuleKind.Override, roomId, {
            conditions: [{ kind: ConditionKind.EventMatch, key: "room_id", pattern: roomId }],
            actions: [PushRuleActionName.DontNotify],
        })
        .catch(() => undefined);
}

async function roomWhenJoined(client: MatrixClient, roomId: string, waitMs = 10_000): Promise<Room | null> {
    for (let waited = 0; waited <= waitMs; waited += 200) {
        const room = client.getRoom(roomId);
        if (room?.getMyMembership() === "join") return room;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return null;
}

// People in a DM or group chat who should have the notes too (joined or invited).
function chatMembers(parent: Room, ownUserId: string): string[] {
    return parent
        .getMembers()
        .filter((member) => (member.membership === "join" || member.membership === "invite") && member.userId !== ownUserId)
        .map((member) => member.userId);
}

const creating = new Map<string, Promise<string>>();

async function createNotesRoom(client: MatrixClient, parent: Room): Promise<string> {
    const ownUserId = client.getSafeUserId();
    const isSpace = parent.isSpaceRoom();
    const encrypted = !isSpace && Boolean(await client.getCrypto()?.isEncryptionEnabledInRoom(parent.roomId));
    const members = isSpace ? [] : chatMembers(parent, ownUserId);
    const initialState: Array<{ type: string; state_key: string; content: Record<string, unknown> }> = [
        { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "shared" } },
    ];
    if (encrypted) {
        initialState.push({ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } });
    }
    if (isSpace) {
        initialState.push({
            type: EventType.RoomJoinRules,
            state_key: "",
            content: { join_rule: JoinRule.Restricted, allow: [{ type: "m.room_membership", room_id: parent.roomId }] },
        });
    }
    const created = await client.createRoom({
        name: `${parent.name || "Chat"} notes`.slice(0, 80),
        preset: Preset.PrivateChat,
        invite: members,
        creation_content: { type: NOTES_ROOM_TYPE },
        initial_state: initialState,
        // Everyone in the room edits notes (plain events). No "users" here: room version 12 forbids listing the
        // creator, and replacing the list would drop the creator's power in older versions.
        power_level_content_override: { events_default: 0 },
    } as never);
    await client.sendStateEvent(parent.roomId, NOTES_LINK_EVENT as never, { room_id: created.room_id, via: [serverOf(ownUserId)] } as never, "");
    return created.room_id;
}

// The notes room for a chat or space, joined: null when there are none yet and `create` is false.
export async function openNotesRoom(client: MatrixClient, parent: Room, create: boolean): Promise<Room | null> {
    let roomId = linkOf(parent)?.roomId ?? null;
    if (!roomId) {
        if (!create) return null;
        let pending = creating.get(parent.roomId);
        if (!pending) {
            pending = createNotesRoom(client, parent).finally(() => creating.delete(parent.roomId));
            creating.set(parent.roomId, pending);
        }
        roomId = await pending;
    }
    const link = linkOf(parent);
    const existing = client.getRoom(roomId);
    if (existing?.getMyMembership() !== "join") {
        await client.joinRoom(roomId, { viaServers: link?.via.length ? link.via : [serverOf(client.getSafeUserId())] });
    }
    await muteNotesRoom(client, roomId);
    const room = await roomWhenJoined(client, roomId);
    if (room && !parent.isSpaceRoom()) {
        // People added to a group chat since get the notes too.
        for (const userId of chatMembers(parent, client.getSafeUserId())) {
            const membership = room.getMember(userId)?.membership;
            if (!membership || membership === "leave") await client.invite(roomId, userId).catch(() => undefined);
        }
    }
    return room;
}

// Someone started notes in a chat you're in: their notes room invites you (so encrypted notes reach your devices).
// Meadhall accepts those quietly instead of showing an invite, but only when a room you're already in links to that
// exact notes room, so it never auto-joins rooms from strangers.
export function watchNotesInvites(client: MatrixClient): () => void {
    const linkedFromMyRooms = (roomId: string): boolean =>
        client.getRooms().some((parent) => parent.getMyMembership() === "join" && linkOf(parent)?.roomId === roomId);
    const accept = (room: Room): void => {
        if (room.getMyMembership() !== "invite" || !linkedFromMyRooms(room.roomId)) return;
        void client
            .joinRoom(room.roomId)
            .then(() => muteNotesRoom(client, room.roomId))
            .catch(() => undefined);
    };
    const onMembership = (room: Room, membership: string): void => {
        if (membership === "invite") accept(room);
    };
    for (const room of client.getRooms()) accept(room);
    client.on(RoomEvent.MyMembership, onMembership);
    client.on(ClientEvent.Room, accept);
    return () => {
        client.off(RoomEvent.MyMembership, onMembership);
        client.off(ClientEvent.Room, accept);
    };
}
