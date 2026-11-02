// SPDX-License-Identifier: AGPL-3.0-only
// Reports and moderation in servers: reading and writing the data in moderationProtocol.ts.
import { EventType, Preset, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import {
    MOD_ACTION_EVENT,
    MOD_ROOM_EVENT,
    MODLOG_ROOM_TYPE,
    REPORT_EVENT,
    REPORT_REASONS_EVENT,
    REPORT_ROOM_TYPE,
    REPORT_STATUS_EVENT,
    SANCTION_EVENT,
    expiredParts,
    modActionContent,
    parseModAction,
    parseReport,
    parseReportReasons,
    parseSanction,
    reportContent,
    sanctionContent,
    sanctionKey,
    userFromSanctionKey,
    type ModAction,
    type ModLogEntry,
    type ReportDetails,
    type ReportReason,
    type Sanction,
} from "./moderationProtocol";

const MAX_MODERATORS = 20;

function powerLevels(room: Room): { users: Record<string, number>; usersDefault: number; ban: number; content: Record<string, unknown> } {
    const content = (room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ?? {}) as Record<string, unknown>;
    return {
        users: (content.users ?? {}) as Record<string, number>,
        usersDefault: typeof content.users_default === "number" ? content.users_default : 0,
        ban: typeof content.ban === "number" ? content.ban : 50,
        content,
    };
}

// Room version 12 and later: the room's creators outrank everyone and aren't listed in the power levels.
function creators(room: Room): string[] {
    const create = room.currentState.getStateEvents(EventType.RoomCreate, "");
    const content = (create?.getContent() ?? {}) as { room_version?: string; additional_creators?: unknown };
    const version = Number(content.room_version ?? room.getVersion());
    if (!Number.isFinite(version) || version < 12) return [];
    const extra = Array.isArray(content.additional_creators) ? content.additional_creators.filter((id): id is string => typeof id === "string") : [];
    return [create?.getSender() ?? "", ...extra].filter(Boolean);
}

function levelOf(room: Room, userId: string): number {
    if (creators(room).includes(userId)) return Number.POSITIVE_INFINITY;
    const levels = powerLevels(room);
    return typeof levels.users[userId] === "number" ? levels.users[userId]! : levels.usersDefault;
}

// Moderators: members who may ban in the server.
export function isModerator(space: Room | null, userId: string): boolean {
    return Boolean(space && levelOf(space, userId) >= powerLevels(space).ban);
}

// Read from the power levels (member lists load lazily), leaving out anyone known to have left or been banned.
export function moderators(space: Room): string[] {
    const { users, ban } = powerLevels(space);
    return [...creators(space).map((userId): [string, number] => [userId, Number.POSITIVE_INFINITY]), ...Object.entries(users)]
        .filter(([userId, level]) => level >= ban && !["leave", "ban"].includes(space.getMember(userId)?.membership ?? ""))
        .sort((left, right) => right[1] - left[1])
        .map(([userId]) => userId)
        .slice(0, MAX_MODERATORS);
}

// The server's channels you're in.
export function spaceChannels(client: MatrixClient, space: Room): Room[] {
    return space.currentState
        .getStateEvents(EventType.SpaceChild)
        .filter((event) => Object.keys(event.getContent()).length > 0)
        .map((event) => client.getRoom(event.getStateKey() ?? ""))
        .filter((room): room is Room => Boolean(room && room.getMyMembership() === "join"));
}

function roomType(room: Room): string | undefined {
    return room.currentState.getStateEvents(EventType.RoomCreate, "")?.getContent()?.type as string | undefined;
}

// Report and moderation-log rooms are kept out of room lists (they're shown in Server Settings → Reports).
export function isModerationRoom(room: Room): boolean {
    const type = roomType(room);
    return type === REPORT_ROOM_TYPE || type === MODLOG_ROOM_TYPE;
}

// --- Report reasons ---

export function readReportReasons(space: Room): ReportReason[] {
    return parseReportReasons(space.currentState.getStateEvents(REPORT_REASONS_EVENT as never, "")?.getContent());
}

export async function saveReportReasons(client: MatrixClient, space: Room, reasons: ReportReason[]): Promise<void> {
    await client.sendStateEvent(space.roomId, REPORT_REASONS_EVENT as never, { reasons } as never, "");
}

// --- Reports ---

export async function createReport(client: MatrixClient, space: Room, details: Omit<ReportDetails, "space">): Promise<string> {
    const me = client.getSafeUserId();
    const mods = moderators(space).filter((userId) => userId !== me && userId !== details.reportedUser);
    if (!mods.length) throw new Error("This space has no moderators to send a report to.");
    const name = space.getMember(details.reportedUser)?.name ?? details.reportedUser;
    const { room_id: roomId } = await client.createRoom({
        name: `Report: ${name}`.slice(0, 80),
        preset: Preset.PrivateChat,
        invite: mods,
        creation_content: { type: REPORT_ROOM_TYPE },
        initial_state: [
            { type: REPORT_EVENT, state_key: "", content: reportContent({ ...details, space: space.roomId }) },
            { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "shared" } },
        ],
        // Moderators can mark it handled. (The creator isn't listed: room version 12 refuses that, and older versions
        // give the creator 100 anyway.)
        power_level_content_override: { users: Object.fromEntries(mods.map((userId) => [userId, 50])) },
    } as never);
    return roomId;
}

export interface ReportItem {
    room: Room;
    details: ReportDetails | null;
    reporter: string;
    status: "open" | "resolved";
    resolvedBy?: string;
    outcome?: string;
    at: number;
}

export function listReports(client: MatrixClient, spaceId: string): ReportItem[] {
    return client
        .getRooms()
        .filter((room) => roomType(room) === REPORT_ROOM_TYPE && ["join", "invite"].includes(room.getMyMembership()))
        .map((room): ReportItem => {
            const create = room.currentState.getStateEvents(EventType.RoomCreate, "");
            const status = room.currentState.getStateEvents(REPORT_STATUS_EVENT as never, "");
            const statusContent = (status?.getContent() ?? {}) as { status?: string; outcome?: string };
            return {
                room,
                details: parseReport(room.currentState.getStateEvents(REPORT_EVENT as never, "")?.getContent()),
                reporter: create?.getSender() ?? "",
                status: statusContent.status === "resolved" ? "resolved" : "open",
                ...(status ? { resolvedBy: status.getSender() } : {}),
                ...(typeof statusContent.outcome === "string" ? { outcome: statusContent.outcome.slice(0, 120) } : {}),
                at: create?.getTs() ?? 0,
            };
        })
        // Invited (not yet opened) reports have no details yet: keep them, they're joined when the list opens.
        .filter((item) => !item.details || item.details.space === spaceId)
        .sort((left, right) => Number(left.status === "resolved") - Number(right.status === "resolved") || right.at - left.at);
}

export async function resolveReport(client: MatrixClient, report: Room, outcome: string): Promise<void> {
    await client.sendStateEvent(report.roomId, REPORT_STATUS_EVENT as never, { status: "resolved", outcome: outcome.slice(0, 120) } as never, "");
}

// A moderator's Meadhall joins report invites from people in a server they moderate (not from anyone else).
export function shouldAutoJoinReport(client: MatrixClient, room: Room): boolean {
    if (room.getMyMembership() !== "invite" || roomType(room) !== REPORT_ROOM_TYPE) return false;
    const inviter = room.getMember(client.getSafeUserId())?.events.member?.getSender();
    if (!inviter) return false;
    return client
        .getRooms()
        .some((space) => space.isSpaceRoom() && space.getMyMembership() === "join" && isModerator(space, client.getSafeUserId()) && space.getMember(inviter)?.membership === "join");
}

// --- Sanctions ---

export function readSanction(space: Room, userId: string): Sanction {
    return parseSanction(space.currentState.getStateEvents(SANCTION_EVENT as never, sanctionKey(userId))?.getContent());
}

export function isShadowMuted(space: Room | null, userId: string): boolean {
    return Boolean(space && readSanction(space, userId).shadow);
}

async function writeSanction(client: MatrixClient, space: Room, userId: string, sanction: Sanction): Promise<void> {
    await client.sendStateEvent(space.roomId, SANCTION_EVENT as never, sanctionContent(sanction) as never, sanctionKey(userId));
}

async function setChannelLevel(client: MatrixClient, room: Room, userId: string, level: number | null): Promise<void> {
    const { content } = powerLevels(room);
    const users = { ...((content.users ?? {}) as Record<string, number>) };
    if (level === null) delete users[userId];
    else users[userId] = level;
    await client.sendStateEvent(room.roomId, EventType.RoomPowerLevels, { ...content, users } as never, "");
}

// --- The moderation log ---

export function modLogRoom(client: MatrixClient, space: Room): Room | null {
    const roomId = space.currentState.getStateEvents(MOD_ROOM_EVENT as never, "")?.getContent()?.room_id;
    return typeof roomId === "string" ? client.getRoom(roomId) : null;
}

// The log room's ID, made by the first moderator who needs it; every moderator is invited (and joins when they
// look). One creation per space even when two actions come at once (the space's state only says so after a sync).
const creatingLogRoom = new Map<string, Promise<string | null>>();

async function modLogRoomId(client: MatrixClient, space: Room): Promise<string | null> {
    const known = space.currentState.getStateEvents(MOD_ROOM_EVENT as never, "")?.getContent()?.room_id;
    if (typeof known === "string") {
        const room = client.getRoom(known);
        if (room?.getMyMembership() !== "join") await client.joinRoom(known).catch(() => undefined);
        const joined = client.getRoom(known);
        if (joined) {
            // Moderators added since get invited.
            for (const userId of moderators(space)) {
                const membership = joined.getMember(userId)?.membership;
                if (!membership || membership === "leave") await client.invite(known, userId).catch(() => undefined);
            }
        }
        return known;
    }
    let pending = creatingLogRoom.get(space.roomId);
    if (!pending) {
        pending = (async (): Promise<string | null> => {
            const mods = moderators(space).filter((userId) => userId !== client.getSafeUserId());
            const created = await client.createRoom({
                name: `${space.name || "Space"} moderation log`.slice(0, 80),
                preset: Preset.PrivateChat,
                invite: mods,
                creation_content: { type: MODLOG_ROOM_TYPE },
                initial_state: [{ type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "shared" } }],
                power_level_content_override: { users: Object.fromEntries(mods.map((userId) => [userId, 50])), events_default: 50 },
            } as never);
            await client.sendStateEvent(space.roomId, MOD_ROOM_EVENT as never, { room_id: created.room_id } as never, "");
            return created.room_id;
        })().catch(() => {
            creatingLogRoom.delete(space.roomId);
            return null;
        });
        creatingLogRoom.set(space.roomId, pending);
    }
    return pending;
}

// A room just made or joined only exists in the client after the next sync.
async function roomWhenSynced(client: MatrixClient, roomId: string, waitMs = 5_000): Promise<Room | null> {
    for (let waited = 0; waited <= waitMs; waited += 200) {
        const room = client.getRoom(roomId);
        if (room?.getMyMembership() === "join") return room;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return client.getRoom(roomId);
}

export async function ensureModLogRoom(client: MatrixClient, space: Room): Promise<Room | null> {
    const roomId = await modLogRoomId(client, space).catch(() => null);
    return roomId ? roomWhenSynced(client, roomId) : null;
}

export async function readModLog(client: MatrixClient, space: Room, userId?: string): Promise<ModLogEntry[]> {
    const room = await ensureModLogRoom(client, space);
    if (!room) return [];
    const read = (): ModLogEntry[] =>
        room
            .getLiveTimeline()
            .getEvents()
            .filter((event: MatrixEvent) => event.getType() === MOD_ACTION_EVENT)
            .map((event) => parseModAction(event.getContent(), event.getSender() ?? "", event.getTs()))
            .filter((entry): entry is ModLogEntry => Boolean(entry) && (!userId || entry!.user === userId));
    // Older entries: scroll back a few pages.
    for (let page = 0; page < 5 && room.getLiveTimeline().getPaginationToken("b" as never); page += 1) {
        await client.scrollback(room, 100).catch(() => undefined);
    }
    return read().sort((left, right) => right.at - left.at);
}

// Sent by room ID, so it works even before a brand-new log room has synced.
async function logAction(client: MatrixClient, space: Room, entry: Omit<ModLogEntry, "by" | "at">): Promise<void> {
    const roomId = await modLogRoomId(client, space);
    if (roomId) await client.sendEvent(roomId, MOD_ACTION_EVENT as never, modActionContent(entry) as never);
}

// --- Actions ---

export interface ActionOptions {
    reason: string;
    // For timed bans and mutes.
    durationMs?: number;
}

export async function applyModAction(client: MatrixClient, space: Room, user: string, action: ModAction, options: ActionOptions): Promise<void> {
    const channels = spaceChannels(client, space);
    const rooms = [space, ...channels];
    const sanction = readSanction(space, user);
    const until = options.durationMs ? Date.now() + options.durationMs : undefined;
    const reason = options.reason || undefined;
    switch (action) {
        case "kick":
            for (const room of rooms) {
                const membership = room.getMember(user)?.membership;
                if (membership === "join" || membership === "invite") await client.kick(room.roomId, user, reason);
            }
            break;
        case "ban":
        case "timed_ban":
            for (const room of rooms) await client.ban(room.roomId, user, reason);
            await writeSanction(client, space, user, { ...sanction, banUntil: action === "timed_ban" ? until : undefined });
            break;
        case "unban":
            for (const room of rooms) if (room.getMember(user)?.membership === "ban") await client.unban(room.roomId, user);
            await writeSanction(client, space, user, { ...sanction, banUntil: undefined });
            break;
        case "mute": {
            const mutedLevels = { ...(sanction.mutedLevels ?? {}) };
            for (const room of channels) {
                if (!(room.roomId in mutedLevels)) {
                    const current = powerLevels(room).users[user];
                    mutedLevels[room.roomId] = typeof current === "number" ? current : null;
                }
                await setChannelLevel(client, room, user, -1);
            }
            await writeSanction(client, space, user, { ...sanction, muteUntil: until, mutedLevels });
            break;
        }
        case "unmute":
            for (const room of channels) {
                const previous = sanction.mutedLevels?.[room.roomId];
                await setChannelLevel(client, room, user, previous === undefined ? null : previous);
            }
            await writeSanction(client, space, user, { ...sanction, muteUntil: undefined, mutedLevels: undefined });
            break;
        case "shadow_mute":
            await writeSanction(client, space, user, { ...sanction, shadow: true });
            break;
        case "unshadow":
            await writeSanction(client, space, user, { ...sanction, shadow: undefined });
            break;
        case "warn":
        case "dismiss":
            break;
    }
    await logAction(client, space, { user, action, reason: options.reason, ...(until ? { until } : {}) });
}

// Timed bans and mutes that have run out are lifted by whichever moderator's Meadhall notices first.
export async function liftExpiredSanctions(client: MatrixClient, space: Room, now = Date.now()): Promise<number> {
    if (!isModerator(space, client.getSafeUserId())) return 0;
    let lifted = 0;
    for (const event of space.currentState.getStateEvents(SANCTION_EVENT as never)) {
        const user = userFromSanctionKey(event.getStateKey() ?? "");
        if (!user) continue;
        const expired = expiredParts(parseSanction(event.getContent()), now);
        if (expired.ban) {
            await applyModAction(client, space, user, "unban", { reason: "Timed ban ended" });
            lifted += 1;
        }
        if (expired.mute) {
            await applyModAction(client, space, user, "unmute", { reason: "Timed mute ended" });
            lifted += 1;
        }
    }
    return lifted;
}
