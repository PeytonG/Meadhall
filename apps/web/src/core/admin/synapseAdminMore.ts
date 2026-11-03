// SPDX-License-Identifier: AGPL-3.0-only
// The rest of what Synapse-Admin offers, for Settings → Server admin: users in detail (devices, connections, media,
// rooms, pushers, lock, erase, shadow-ban, rate limits), rooms, users' media, reported events, the room directory,
// federation and an overview. Endpoints: https://element-hq.github.io/synapse/latest/usage/administration/admin_api/
import { Method, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { admin, userPath, type AdminUser } from "./synapseAdmin";

const flag = (value: unknown): boolean => value === true || value === 1;
const nextNumber = (value: unknown): number | null => (value === undefined || value === null || value === "" ? null : Number(value));

// --- Users ---

export interface AdminUserRow extends AdminUser {
    is_guest: boolean;
    locked: boolean;
    erased: boolean;
    shadow_banned: boolean;
    user_type: string | null;
}

function userRow(user: Record<string, unknown>): AdminUserRow {
    return {
        name: String(user.name ?? ""),
        displayname: typeof user.displayname === "string" ? user.displayname : null,
        admin: flag(user.admin),
        deactivated: flag(user.deactivated),
        avatar_url: typeof user.avatar_url === "string" ? user.avatar_url : null,
        creation_ts: typeof user.creation_ts === "number" ? user.creation_ts : 0,
        is_guest: flag(user.is_guest),
        locked: flag(user.locked),
        erased: flag(user.erased),
        shadow_banned: flag(user.shadow_banned),
        user_type: typeof user.user_type === "string" ? user.user_type : null,
    };
}

// The users list with Synapse-Admin's filters.
export async function listUsersFiltered(
    client: MatrixClient,
    options: { search?: string; from?: number; limit?: number; guests: boolean; deactivated: boolean; locked: boolean },
): Promise<{ users: AdminUserRow[]; total: number; nextFrom: number | null }> {
    const query: Record<string, string> = {
        from: String(options.from ?? 0),
        limit: String(options.limit ?? 50),
        guests: String(options.guests),
        deactivated: String(options.deactivated),
        locked: String(options.locked),
        order_by: "name",
    };
    if (options.search?.trim()) query.name = options.search.trim();
    const response = await admin<{ users?: Array<Record<string, unknown>>; total?: number; next_token?: string }>(client, Method.Get, "/v2/users", { query });
    const users = (response.users ?? []).map(userRow);
    return { users, total: response.total ?? users.length, nextFrom: nextNumber(response.next_token) };
}

export interface AdminUserDetails extends AdminUserRow {
    threepids: Array<{ medium: string; address: string; added_at?: number; validated_at?: number }>;
    external_ids: Array<{ auth_provider: string; external_id: string }>;
}

export async function getUser(client: MatrixClient, userId: string): Promise<AdminUserDetails> {
    const user = await admin<Record<string, unknown>>(client, Method.Get, `/v2/users/${userPath(userId)}`);
    return {
        ...userRow({ name: userId, ...user }),
        threepids: Array.isArray(user.threepids) ? (user.threepids as AdminUserDetails["threepids"]) : [],
        external_ids: Array.isArray(user.external_ids) ? (user.external_ids as AdminUserDetails["external_ids"]) : [],
    };
}

export interface UserChanges {
    displayname?: string;
    password?: string;
    logout_devices?: boolean;
    user_type?: string | null;
    admin?: boolean;
    locked?: boolean;
    deactivated?: boolean;
    threepids?: AdminUserDetails["threepids"];
    external_ids?: AdminUserDetails["external_ids"];
}

// PUT /v2/users: only the fields given change. Reactivating an account needs a password.
export async function updateUser(client: MatrixClient, userId: string, changes: UserChanges): Promise<void> {
    await admin(client, Method.Put, `/v2/users/${userPath(userId)}`, { body: changes });
}

// Deactivates and erases: their messages are hidden from people who join later; profile and media are removed.
export async function eraseUser(client: MatrixClient, userId: string): Promise<void> {
    await admin(client, Method.Post, `/v1/deactivate/${userPath(userId)}`, { body: { erase: true } });
}

// Deletes the account's data for good (Synapse 1.120+: deactivates, erases, removes media and rooms' local data).
export async function deleteUser(client: MatrixClient, userId: string): Promise<void> {
    await eraseUser(client, userId);
    const media = await listUserMedia(client, userId, 0, 1000).catch(() => ({ media: [] as AdminMedia[] }));
    for (const item of media.media) await deleteMedia(client, item.media_id).catch(() => undefined);
}

// Shadow-banned users get "sent" for everything, but nobody else sees what they send.
export async function setShadowBanned(client: MatrixClient, userId: string, banned: boolean): Promise<void> {
    await admin(client, banned ? Method.Post : Method.Delete, `/v1/users/${userPath(userId)}/shadow_ban`);
}

export interface RateLimitOverride {
    messages_per_second: number;
    burst_count: number;
}

export async function getRateLimit(client: MatrixClient, userId: string): Promise<RateLimitOverride | null> {
    const response = await admin<Partial<RateLimitOverride>>(client, Method.Get, `/v1/users/${userPath(userId)}/override_ratelimit`);
    return typeof response.messages_per_second === "number" ? { messages_per_second: response.messages_per_second, burst_count: response.burst_count ?? 0 } : null;
}

export async function setRateLimit(client: MatrixClient, userId: string, override: RateLimitOverride | null): Promise<void> {
    if (override) await admin(client, Method.Post, `/v1/users/${userPath(userId)}/override_ratelimit`, { body: override });
    else await admin(client, Method.Delete, `/v1/users/${userPath(userId)}/override_ratelimit`);
}

export interface AdminDevice {
    device_id: string;
    display_name: string | null;
    last_seen_ip: string | null;
    last_seen_ts: number | null;
    last_seen_user_agent?: string | null;
}

export async function listDevices(client: MatrixClient, userId: string): Promise<AdminDevice[]> {
    return (await admin<{ devices?: AdminDevice[] }>(client, Method.Get, `/v2/users/${userPath(userId)}/devices`)).devices ?? [];
}

export async function deleteDevice(client: MatrixClient, userId: string, deviceId: string): Promise<void> {
    await admin(client, Method.Delete, `/v2/users/${userPath(userId)}/devices/${encodeURIComponent(deviceId)}`);
}

export interface Connection {
    device: string;
    ip: string;
    last_seen: number;
    user_agent: string;
}

// Where they've connected from (the "whois" admin API), newest first.
export async function listConnections(client: MatrixClient, userId: string): Promise<Connection[]> {
    const response = await admin<{ devices?: Record<string, { sessions?: Array<{ connections?: Array<Omit<Connection, "device">> }> }> }>(
        client,
        Method.Get,
        `/v1/whois/${userPath(userId)}`,
    );
    const connections: Connection[] = [];
    for (const [device, info] of Object.entries(response.devices ?? {})) {
        for (const session of info.sessions ?? []) for (const connection of session.connections ?? []) connections.push({ device, ...connection });
    }
    return connections.sort((left, right) => right.last_seen - left.last_seen);
}

export interface AdminMedia {
    media_id: string;
    media_type: string | null;
    media_length: number;
    upload_name: string | null;
    created_ts: number;
    last_access_ts: number | null;
    quarantined_by: string | null;
    safe_from_quarantine: boolean;
}

export async function listUserMedia(client: MatrixClient, userId: string, from = 0, limit = 50): Promise<{ media: AdminMedia[]; total: number; nextFrom: number | null }> {
    const response = await admin<{ media?: AdminMedia[]; total?: number; next_token?: number }>(client, Method.Get, `/v1/users/${userPath(userId)}/media`, {
        query: { from: String(from), limit: String(limit), order_by: "created_ts", dir: "b" },
    });
    return { media: response.media ?? [], total: response.total ?? 0, nextFrom: nextNumber(response.next_token) };
}

export async function deleteMedia(client: MatrixClient, mediaId: string): Promise<void> {
    await admin(client, Method.Delete, `/v1/media/${encodeURIComponent(client.getDomain() ?? "")}/${encodeURIComponent(mediaId)}`);
}

export async function setMediaQuarantined(client: MatrixClient, mediaId: string, quarantined: boolean): Promise<void> {
    await admin(client, Method.Post, `/v1/media/${quarantined ? "quarantine" : "unquarantine"}/${encodeURIComponent(client.getDomain() ?? "")}/${encodeURIComponent(mediaId)}`);
}

export async function listJoinedRooms(client: MatrixClient, userId: string): Promise<string[]> {
    return (await admin<{ joined_rooms?: string[] }>(client, Method.Get, `/v1/users/${userPath(userId)}/joined_rooms`)).joined_rooms ?? [];
}

export interface Pusher {
    app_display_name: string;
    device_display_name: string;
    kind: string;
    pushkey: string;
    app_id: string;
    data?: { url?: string };
}

export async function listPushers(client: MatrixClient, userId: string): Promise<Pusher[]> {
    return (await admin<{ pushers?: Pusher[] }>(client, Method.Get, `/v1/users/${userPath(userId)}/pushers`)).pushers ?? [];
}

// --- Rooms ---

export interface AdminRoom {
    room_id: string;
    name: string | null;
    canonical_alias: string | null;
    joined_members: number;
    joined_local_members: number;
    version: string;
    creator: string | null;
    encryption: string | null;
    federatable: boolean;
    public: boolean;
    join_rules: string | null;
    room_type: string | null;
    state_events: number;
}

export async function listRooms(client: MatrixClient, options: { search?: string; from?: number; limit?: number }): Promise<{ rooms: AdminRoom[]; total: number; nextFrom: number | null }> {
    const query: Record<string, string> = { from: String(options.from ?? 0), limit: String(options.limit ?? 50), order_by: "joined_members", dir: "b" };
    if (options.search?.trim()) query.search_term = options.search.trim();
    const response = await admin<{ rooms?: AdminRoom[]; total_rooms?: number; next_batch?: number }>(client, Method.Get, "/v1/rooms", { query });
    return { rooms: response.rooms ?? [], total: response.total_rooms ?? 0, nextFrom: nextNumber(response.next_batch) };
}

export async function listRoomMembers(client: MatrixClient, roomId: string): Promise<string[]> {
    return (await admin<{ members?: string[] }>(client, Method.Get, `/v1/rooms/${encodeURIComponent(roomId)}/members`)).members ?? [];
}

// Deletes a room for everyone on this server (members removed; optionally blocked so nobody here joins it again, and
// its data purged). Synapse does it in the background.
export async function deleteRoom(client: MatrixClient, roomId: string, options: { block: boolean; purge: boolean; message?: string }): Promise<void> {
    await admin(client, Method.Delete, `/v2/rooms/${encodeURIComponent(roomId)}`, {
        body: { block: options.block, purge: options.purge, ...(options.message ? { message: options.message, new_room_user_id: client.getSafeUserId() } : {}) },
    });
}

export async function setRoomBlocked(client: MatrixClient, roomId: string, block: boolean): Promise<void> {
    await admin(client, Method.Put, `/v1/rooms/${encodeURIComponent(roomId)}/block`, { body: { block } });
}

// Gives a local member (default: you) the highest power in a room, e.g. when its admins left.
export async function makeRoomAdmin(client: MatrixClient, roomId: string, userId: string): Promise<void> {
    await admin(client, Method.Post, `/v1/rooms/${encodeURIComponent(roomId)}/make_room_admin`, { body: { user_id: userId } });
}

// Removes a room's history older than a date (keeps the latest event and the room's state).
export async function purgeHistory(client: MatrixClient, roomId: string, beforeTs: number): Promise<string> {
    const response = await admin<{ purge_id?: string }>(client, Method.Post, `/v1/purge_history/${encodeURIComponent(roomId)}`, {
        body: { delete_local_events: false, purge_up_to_ts: beforeTs },
    });
    return response.purge_id ?? "";
}

// --- Users' media ---

export interface MediaUsage {
    user_id: string;
    displayname: string | null;
    media_count: number;
    media_length: number;
}

export async function listMediaUsage(client: MatrixClient, from = 0, limit = 50): Promise<{ users: MediaUsage[]; total: number; nextFrom: number | null }> {
    const response = await admin<{ users?: MediaUsage[]; total?: number; next_token?: number }>(client, Method.Get, "/v1/statistics/users/media", {
        query: { from: String(from), limit: String(limit), order_by: "media_length", dir: "b" },
    });
    return { users: response.users ?? [], total: response.total ?? 0, nextFrom: nextNumber(response.next_token) };
}

// Cached copies of other servers' media older than this are dropped (fetched again when someone looks).
export async function purgeRemoteMediaCache(client: MatrixClient, olderThanDays: number): Promise<number> {
    const response = await admin<{ deleted?: number }>(client, Method.Post, "/v1/purge_media_cache", {
        query: { before_ts: String(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) },
    });
    return response.deleted ?? 0;
}

// --- Reported events (reports people sent to the homeserver, not a space's reports) ---

export interface EventReport {
    id: number;
    received_ts: number;
    room_id: string;
    name: string | null;
    event_id: string;
    user_id: string;
    sender: string | null;
    reason: string | null;
    score: number | null;
}

export async function listEventReports(client: MatrixClient, from = 0, limit = 50): Promise<{ reports: EventReport[]; total: number; nextFrom: number | null }> {
    const response = await admin<{ event_reports?: EventReport[]; total?: number; next_token?: number }>(client, Method.Get, "/v1/event_reports", {
        query: { from: String(from), limit: String(limit), dir: "b" },
    });
    return { reports: response.event_reports ?? [], total: response.total ?? 0, nextFrom: nextNumber(response.next_token) };
}

export async function reportedEventText(client: MatrixClient, id: number): Promise<string | null> {
    const report = await admin<{ event_json?: { content?: { body?: unknown } } }>(client, Method.Get, `/v1/event_reports/${id}`);
    const body = report.event_json?.content?.body;
    return typeof body === "string" ? body : null;
}

export async function deleteEventReport(client: MatrixClient, id: number): Promise<void> {
    await admin(client, Method.Delete, `/v1/event_reports/${id}`);
}

// --- Room directory (the public room list; the client API lets server admins change any room's listing) ---

export interface DirectoryRoom {
    room_id: string;
    name?: string;
    canonical_alias?: string;
    topic?: string;
    num_joined_members: number;
}

export async function listDirectory(client: MatrixClient): Promise<DirectoryRoom[]> {
    const rooms: DirectoryRoom[] = [];
    let since: string | undefined;
    do {
        const page = await client.publicRooms({ limit: 100, ...(since ? { since } : {}) });
        rooms.push(...(page.chunk as unknown as DirectoryRoom[]));
        since = page.next_batch;
    } while (since && rooms.length < 1000);
    return rooms;
}

export async function setInDirectory(client: MatrixClient, roomId: string, listed: boolean): Promise<void> {
    await client.http.authedRequest(Method.Put, `/directory/list/room/${encodeURIComponent(roomId)}`, undefined, { visibility: listed ? "public" : "private" } as never);
}

// --- Federation ---

export interface Destination {
    destination: string;
    retry_last_ts: number;
    retry_interval: number;
    failure_ts: number | null;
    last_successful_stream_ordering: number | null;
}

export async function listDestinations(client: MatrixClient, options: { search?: string; from?: number; limit?: number }): Promise<{ destinations: Destination[]; total: number; nextFrom: number | null }> {
    const query: Record<string, string> = { from: String(options.from ?? 0), limit: String(options.limit ?? 50), order_by: "destination" };
    if (options.search?.trim()) query.destination = options.search.trim();
    const response = await admin<{ destinations?: Destination[]; total?: number; next_token?: string }>(client, Method.Get, "/v1/federation/destinations", { query });
    return { destinations: response.destinations ?? [], total: response.total ?? 0, nextFrom: nextNumber(response.next_token) };
}

export async function listDestinationRooms(client: MatrixClient, destination: string): Promise<Array<{ room_id: string; stream_ordering: number }>> {
    const response = await admin<{ rooms?: Array<{ room_id: string; stream_ordering: number }> }>(
        client,
        Method.Get,
        `/v1/federation/destinations/${encodeURIComponent(destination)}/rooms`,
        { query: { limit: "500" } },
    );
    return response.rooms ?? [];
}

// Clears the back-off, so Synapse tries that server again now.
export async function reconnectDestination(client: MatrixClient, destination: string): Promise<void> {
    await admin(client, Method.Post, `/v1/federation/destinations/${encodeURIComponent(destination)}/reset_connection`, { body: {} });
}

// --- Overview ---

export async function serverVersion(client: MatrixClient): Promise<string> {
    return (await admin<{ server_version?: string }>(client, Method.Get, "/v1/server_version")).server_version ?? "unknown";
}

export async function backgroundUpdates(client: MatrixClient): Promise<{ enabled: boolean; running: string[] }> {
    const response = await admin<{ enabled?: boolean; current_updates?: Record<string, { name?: string }> }>(client, Method.Get, "/v1/background_updates/status");
    return { enabled: response.enabled !== false, running: Object.entries(response.current_updates ?? {}).map(([db, update]) => `${update.name ?? "update"} (${db})`) };
}

export async function largestRooms(client: MatrixClient): Promise<Array<{ room_id: string; estimated_size: number }>> {
    return (await admin<{ rooms?: Array<{ room_id: string; estimated_size: number }> }>(client, Method.Get, "/v1/statistics/database/rooms")).rooms ?? [];
}

// --- CSV ---

// Quoted cells and CRLF lines, so it opens cleanly in spreadsheets.
export function toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]!);
    const cell = (value: unknown): string => `"${String(value ?? "").replace(/"/g, '""')}"`;
    return [headers.map(cell).join(","), ...rows.map((row) => headers.map((header) => cell(row[header])).join(","))].join("\r\n");
}

export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]!;
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (char === '"') quoted = false;
            else cell += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
            row.push(cell);
            cell = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[index + 1] === "\n") index += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else cell += char;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((value) => value.trim()));
}

export interface ImportedUser {
    username: string;
    displayname?: string;
    password?: string;
    admin: boolean;
}

// Synapse-Admin's import format: a header row with id (or name), and optionally displayname, password, admin.
export function parseUsersCsv(text: string): ImportedUser[] {
    const [header, ...body] = parseCsv(text);
    if (!header) return [];
    const at = (name: string): number => header.findIndex((cell) => cell.trim().toLowerCase() === name);
    const id = at("id") >= 0 ? at("id") : at("name");
    if (id < 0) throw new Error("The CSV needs an id (or name) column.");
    const column = (row: string[], name: string): string => (at(name) >= 0 ? (row[at(name)] ?? "").trim() : "");
    return body
        .filter((row) => (row[id] ?? "").trim())
        .map((row) => ({
            username: row[id]!.trim(),
            ...(column(row, "displayname") ? { displayname: column(row, "displayname") } : {}),
            ...(column(row, "password") ? { password: column(row, "password") } : {}),
            admin: /^(true|1|yes)$/i.test(column(row, "admin")),
        }));
}

export function downloadText(filename: string, text: string, type = "text/csv"): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDate(ts: number | null | undefined): string {
    return ts ? new Date(ts).toLocaleString() : "";
}
