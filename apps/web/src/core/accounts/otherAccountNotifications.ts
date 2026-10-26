// SPDX-License-Identifier: AGPL-3.0-only
// Notifications for the signed-in accounts that aren't active. Only one account runs a full client, so the others
// are checked the way the Android background service does it: the homeserver's /notifications list (what push
// rules said to notify about), with each account's own access token. Encrypted messages can't be read without
// that account's client, so they show as "New encrypted message".
import { WebPlatform } from "../platform/WebPlatform";
import { loadVault, updateStoredTokens, type StoredAccount } from "../storage/accounts";
import { ACCESS_TOKEN_IV, REFRESH_TOKEN_IV, encryptToken, tryDecryptToken } from "../storage/tokens";

const LAST_SEEN_KEY = "meadhall_other_accounts_seen";

export interface OtherAccountNotification {
    accountUserId: string;
    accountName: string;
    roomId: string;
    eventId: string;
    title: string;
    body: string;
}

interface NotificationsResponse {
    notifications?: Array<{
        room_id?: string;
        ts?: number;
        read?: boolean;
        event?: { event_id?: string; type?: string; sender?: string; content?: Record<string, unknown> };
    }>;
}

function loadLastSeen(): Record<string, number> {
    try {
        return JSON.parse(window.localStorage.getItem(LAST_SEEN_KEY) ?? "{}") as Record<string, number>;
    } catch {
        return {};
    }
}

function saveLastSeen(seen: Record<string, number>): void {
    try {
        window.localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(seen));
    } catch {
        // Seen again next time.
    }
}

function describe(event: NonNullable<NonNullable<NotificationsResponse["notifications"]>[number]["event"]>): string {
    const content = event.content ?? {};
    if (event.type === "m.room.encrypted") return "New encrypted message";
    if (event.type === "m.room.member") return "Invited you to a room";
    if (event.type?.includes("call") || event.type?.includes("rtc.notification")) return "Incoming call";
    if (content.msgtype === "m.image") return "Sent an image";
    const body = typeof content.body === "string" ? content.body : "";
    return body.length > 140 ? `${body.slice(0, 139)}…` : body || "New message";
}

// Calls send a stream of encrypted events (keys, signals) the server counts as notifying, and they can't be told
// apart from messages without the account's keys. So per check: one notification per conversation (a readable
// message wins over "New encrypted message"), call signals other than a ring dropped, and "New encrypted message"
// at most once a minute per conversation.
const ENCRYPTED_COOLDOWN_MS = 60_000;
const lastEncryptedNotice = new Map<string, number>();

type NotificationItem = NonNullable<NotificationsResponse["notifications"]>[number];

export function collapse(items: NotificationItem[], accountUserId: string, now = Date.now()): NotificationItem[] {
    const byRoom = new Map<string, NotificationItem>();
    for (const item of items) {
        const type = item.event?.type ?? "";
        if (type.includes("rtc.notification") && item.event?.content?.notification_type !== "ring") continue;
        if (type.includes("call.member") || type.includes("encryption_keys")) continue;
        const roomId = item.room_id ?? "";
        const current = byRoom.get(roomId);
        const encrypted = type === "m.room.encrypted";
        // Keep the newest readable one; an encrypted one only if there's nothing readable.
        if (!current || !encrypted || current.event?.type === "m.room.encrypted") byRoom.set(roomId, item);
    }
    return [...byRoom.values()].filter((item) => {
        if (item.event?.type !== "m.room.encrypted") return true;
        const key = `${accountUserId}|${item.room_id}`;
        if (now - (lastEncryptedNotice.get(key) ?? 0) < ENCRYPTED_COOLDOWN_MS) return false;
        lastEncryptedNotice.set(key, now);
        return true;
    });
}

const names = new Map<string, string>();

async function displayName(homeserverUrl: string, token: string, userId: string): Promise<string> {
    const cached = names.get(userId);
    if (cached) return cached;
    try {
        const response = await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const name = response.ok ? ((await response.json()) as { displayname?: string }).displayname : undefined;
        names.set(userId, name || userId);
    } catch {
        names.set(userId, userId);
    }
    return names.get(userId) ?? userId;
}

async function tokensFor(account: StoredAccount, platform: WebPlatform): Promise<{ pickleKey?: string; access?: string; refresh?: string }> {
    const pickleKey = (await platform.getPickleKey(account.userId, account.deviceId)) ?? undefined;
    const access = account.accessToken ? await tryDecryptToken(pickleKey, account.accessToken, ACCESS_TOKEN_IV) : undefined;
    const refresh = account.refreshToken ? await tryDecryptToken(pickleKey, account.refreshToken, REFRESH_TOKEN_IV) : undefined;
    return { pickleKey, access, refresh };
}

// Access tokens with refresh tokens expire after a few minutes; renew them like the active client does.
async function refreshTokens(account: StoredAccount, pickleKey: string | undefined, refresh: string): Promise<string | null> {
    const response = await fetch(`${account.homeserverUrl}/_matrix/client/v3/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { access_token?: string; refresh_token?: string };
    if (!result.access_token) return null;
    await updateStoredTokens(
        account.userId,
        await encryptToken(result.access_token, pickleKey, ACCESS_TOKEN_IV),
        await encryptToken(result.refresh_token ?? refresh, pickleKey, REFRESH_TOKEN_IV),
    );
    return result.access_token;
}

async function fetchNotifications(account: StoredAccount, platform: WebPlatform): Promise<{ token: string; response: NotificationsResponse } | null> {
    const { pickleKey, access, refresh } = await tokensFor(account, platform);
    if (!access) return null;
    const get = (token: string): Promise<Response> =>
        fetch(`${account.homeserverUrl}/_matrix/client/v3/notifications?limit=20`, { headers: { Authorization: `Bearer ${token}` } });
    let token = access;
    let response = await get(token);
    if (response.status === 401 && refresh) {
        const renewed = await refreshTokens(account, pickleKey, refresh);
        if (!renewed) return null;
        token = renewed;
        response = await get(token);
    }
    return response.ok ? { token, response: (await response.json()) as NotificationsResponse } : null;
}

// New notifications for every stored account since the last check. The first check of an account only marks
// "now", so signing in doesn't replay old notifications.
export async function checkOtherAccounts(platform = new WebPlatform()): Promise<OtherAccountNotification[]> {
    const seen = loadLastSeen();
    const found: OtherAccountNotification[] = [];
    for (const account of await loadVault()) {
        try {
            const result = await fetchNotifications(account, platform);
            if (!result) continue;
            const since = seen[account.userId];
            const fresh = (result.response.notifications ?? []).filter(
                (item) => !item.read && typeof item.ts === "number" && since !== undefined && item.ts > since && item.event && item.room_id,
            );
            // Server timestamps only, so a computer clock that's off can't hide new notifications.
            const all = (result.response.notifications ?? []).map((item) => item.ts ?? 0);
            seen[account.userId] = since === undefined ? Math.max(0, ...all) : Math.max(since, ...fresh.map((item) => item.ts ?? 0));
            for (const item of collapse(fresh.reverse(), account.userId)) {
                const event = item.event!;
                const sender = event.sender ? await displayName(account.homeserverUrl, result.token, event.sender) : "Someone";
                found.push({
                    accountUserId: account.userId,
                    accountName: account.displayName || account.userId,
                    roomId: item.room_id!,
                    eventId: event.event_id ?? `${item.room_id}:${item.ts}`,
                    title: `${sender} (to ${account.displayName || account.userId})`,
                    body: describe(event),
                });
            }
        } catch {
            // Offline or the account was signed out elsewhere: try again next time.
        }
    }
    saveLastSeen(seen);
    return found;
}
