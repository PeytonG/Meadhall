// SPDX-License-Identifier: AGPL-3.0-only
// Synapse Admin API (https://element-hq.github.io/synapse/latest/usage/administration/admin_api/) for the in-app
// server admin panel: registration tokens and user management. Synapse rejects every call from non-admins, so
// the panel being hidden is only a convenience, not the protection.
import { Method, type MatrixClient } from "matrix-js-sdk/src/matrix";

const ADMIN_PREFIX = "/_synapse/admin";

function admin<T>(client: MatrixClient, method: Method, path: string, options?: { query?: Record<string, string>; body?: unknown }): Promise<T> {
    return client.http.authedRequest<T>(method, path, options?.query, options?.body as never, { prefix: ADMIN_PREFIX });
}

function userPath(userId: string): string {
    return encodeURIComponent(userId);
}

// True only for server admins. Any failure (403 for normal users, admin API not exposed) means no.
export async function isServerAdmin(client: MatrixClient): Promise<boolean> {
    const userId = client.getUserId();
    if (!userId) {
        return false;
    }
    try {
        const response = await admin<{ admin?: unknown }>(client, Method.Get, `/v1/users/${userPath(userId)}/admin`);
        return response.admin === true;
    } catch {
        return false;
    }
}

export interface RegistrationToken {
    token: string;
    uses_allowed: number | null;
    pending: number;
    completed: number;
    expiry_time: number | null;
}

export async function listRegistrationTokens(client: MatrixClient): Promise<RegistrationToken[]> {
    const response = await admin<{ registration_tokens?: RegistrationToken[] }>(client, Method.Get, "/v1/registration_tokens");
    return response.registration_tokens ?? [];
}

export async function createRegistrationToken(
    client: MatrixClient,
    options: { usesAllowed: number | null; expiresInDays: number | null; token?: string },
): Promise<RegistrationToken> {
    const body: Record<string, unknown> = { uses_allowed: options.usesAllowed };
    if (options.expiresInDays !== null && options.expiresInDays > 0) {
        body.expiry_time = Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000;
    }
    if (options.token && options.token.trim()) {
        body.token = options.token.trim();
    } else {
        body.length = 12;
    }
    return admin<RegistrationToken>(client, Method.Post, "/v1/registration_tokens/new", { body });
}

export async function deleteRegistrationToken(client: MatrixClient, token: string): Promise<void> {
    await admin(client, Method.Delete, `/v1/registration_tokens/${encodeURIComponent(token)}`);
}

export interface AdminUser {
    name: string; // the user ID
    displayname: string | null;
    admin: boolean;
    deactivated: boolean;
    avatar_url: string | null;
    creation_ts: number;
}

export async function listUsers(
    client: MatrixClient,
    options: { search?: string; from?: number; limit?: number },
): Promise<{ users: AdminUser[]; total: number; nextFrom: number | null }> {
    const query: Record<string, string> = {
        from: String(options.from ?? 0),
        limit: String(options.limit ?? 50),
        guests: "false",
        deactivated: "true",
        order_by: "name",
    };
    if (options.search?.trim()) {
        query.name = options.search.trim(); // Synapse matches the user ID and display name
    }
    const response = await admin<{ users?: Array<Record<string, unknown>>; total?: number; next_token?: string }>(
        client,
        Method.Get,
        "/v2/users",
        { query },
    );
    const users = (response.users ?? []).map((user) => ({
        name: String(user.name ?? ""),
        displayname: typeof user.displayname === "string" ? user.displayname : null,
        admin: user.admin === true || user.admin === 1,
        deactivated: user.deactivated === true || user.deactivated === 1,
        avatar_url: typeof user.avatar_url === "string" ? user.avatar_url : null,
        creation_ts: typeof user.creation_ts === "number" ? user.creation_ts : 0,
    }));
    return {
        users,
        total: typeof response.total === "number" ? response.total : users.length,
        nextFrom: response.next_token ? Number(response.next_token) : null,
    };
}

export async function resetUserPassword(client: MatrixClient, userId: string, newPassword: string, logoutDevices: boolean): Promise<void> {
    await admin(client, Method.Post, `/v1/reset_password/${userPath(userId)}`, {
        body: { new_password: newPassword, logout_devices: logoutDevices },
    });
}

export async function setUserAdmin(client: MatrixClient, userId: string, isAdmin: boolean): Promise<void> {
    await admin(client, Method.Put, `/v1/users/${userPath(userId)}/admin`, { body: { admin: isAdmin } });
}

export async function deactivateUser(client: MatrixClient, userId: string): Promise<void> {
    await admin(client, Method.Post, `/v1/deactivate/${userPath(userId)}`, { body: { erase: false } });
}

// Creates an account directly (no registration token needed). Fails if the user ID is taken.
export async function createUserAccount(
    client: MatrixClient,
    options: { username: string; password: string; displayName?: string },
): Promise<string> {
    const serverName = client.getDomain();
    if (!serverName) {
        throw new Error("Unknown server name.");
    }
    const localpart = options.username.trim().replace(/^@/, "").split(":")[0]!.toLowerCase();
    if (!/^[a-z0-9._=\-/+]+$/.test(localpart)) {
        throw new Error("Usernames can use a-z, 0-9 and . _ = - / +");
    }
    const userId = `@${localpart}:${serverName}`;
    try {
        await admin(client, Method.Get, `/v2/users/${userPath(userId)}`);
        throw new Error(`${userId} already exists.`);
    } catch (error) {
        const status = (error as { httpStatus?: number }).httpStatus;
        if (status !== 404) {
            throw error;
        }
    }
    await admin(client, Method.Put, `/v2/users/${userPath(userId)}`, {
        body: { password: options.password, displayname: options.displayName?.trim() || undefined, admin: false },
    });
    return userId;
}

// A random password the admin can hand over (letters and digits that are hard to mix up).
export function generatePassword(length = 14): string {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

// Server notices (https://element-hq.github.io/synapse/latest/admin_api/server_notices.html): a message from the server
// itself, delivered in a room the user can read but not reply in. Needs `server_notices` in homeserver.yaml.
export async function sendServerNotice(client: MatrixClient, userId: string, body: string): Promise<void> {
    // PUT with a transaction ID, so a retried request can't deliver the notice twice.
    await admin(client, Method.Put, `/v1/send_server_notice/${encodeURIComponent(crypto.randomUUID())}`, {
        body: { user_id: userId, content: { msgtype: "m.text", body } },
    });
}

// Every active (not deactivated) account on this server.
export async function listActiveUserIds(client: MatrixClient): Promise<string[]> {
    const userIds: string[] = [];
    let from: number | null = 0;
    while (from !== null) {
        const page = await listUsers(client, { from, limit: 100 });
        userIds.push(...page.users.filter((user) => !user.deactivated).map((user) => user.name));
        from = page.nextFrom;
    }
    return userIds;
}

// "alice, @bob:example.org" → full user IDs on this server for bare names.
export function parseNoticeRecipients(input: string, serverName: string): string[] {
    const ids = input
        .split(/[\s,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.includes(":") ? (entry.startsWith("@") ? entry : `@${entry}`) : `@${entry.replace(/^@/, "")}:${serverName}`));
    return [...new Set(ids)];
}

export function isServerNoticesDisabled(error: unknown): boolean {
    const message = (error as { data?: { error?: unknown } }).data?.error;
    return typeof message === "string" && /server notices are not enabled/i.test(message);
}
