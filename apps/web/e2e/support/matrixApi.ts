// SPDX-License-Identifier: AGPL-3.0-only
// Minimal client-server API helpers for setting up E2E scenarios on the test Synapse.
export const SYNAPSE_URL = process.env.SYNAPSE_URL ?? "http://localhost:8008";

export interface ApiUser {
    userId: string;
    username: string;
    password: string;
    accessToken: string;
}

async function request<T>(user: ApiUser | null, method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(user ? { Authorization: `Bearer ${user.accessToken}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`${method} ${path} failed: HTTP ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as T;
}

export async function registerUser(prefix: string): Promise<ApiUser> {
    const username = `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const password = `pw-${crypto.randomUUID()}`;
    const register = (auth?: unknown): Promise<Response> =>
        fetch(`${SYNAPSE_URL}/_matrix/client/v3/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, auth, initial_device_display_name: "E2E setup" }),
        });
    let response = await register();
    if (response.status === 401) {
        const { session } = (await response.json()) as { session: string };
        response = await register({ type: "m.login.dummy", session });
    }
    if (!response.ok) {
        throw new Error(`Registering ${username} failed: HTTP ${response.status} ${await response.text()}`);
    }
    const { user_id: userId, access_token: accessToken } = (await response.json()) as {
        user_id: string;
        access_token: string;
    };
    return { userId, username, password, accessToken };
}

export async function createRoom(user: ApiUser, options: Record<string, unknown>): Promise<string> {
    const { room_id: roomId } = await request<{ room_id: string }>(user, "POST", "/createRoom", options);
    return roomId;
}

export async function sendState(user: ApiUser, roomId: string, type: string, stateKey: string, content: unknown): Promise<void> {
    await request(user, "PUT", `/rooms/${encodeURIComponent(roomId)}/state/${type}/${encodeURIComponent(stateKey)}`, content);
}

export async function joinRoom(user: ApiUser, roomId: string): Promise<void> {
    await request(user, "POST", `/join/${encodeURIComponent(roomId)}`, {});
}

export async function sendMessage(user: ApiUser, roomId: string, body: string): Promise<void> {
    await request(user, "PUT", `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${crypto.randomUUID()}`, {
        msgtype: "m.text",
        body,
    });
}

export async function readMessages(user: ApiUser, roomId: string): Promise<Array<{ sender: string; body: string }>> {
    const { chunk } = await request<{ chunk: Array<{ type: string; sender: string; content: { body?: string } }> }>(
        user,
        "GET",
        `/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`,
    );
    return chunk
        .filter((event) => event.type === "m.room.message" && typeof event.content.body === "string")
        .map((event) => ({ sender: event.sender, body: event.content.body! }));
}

// A space with one unencrypted text channel, created by `owner` and joined by `member`.
// Unencrypted because the API helpers can't encrypt; E2EE is covered by the integration tests.
export async function createSpaceWithChannel(
    owner: ApiUser,
    member: ApiUser,
    names: { space: string; channel: string },
): Promise<{ spaceId: string; channelId: string }> {
    const spaceId = await createRoom(owner, {
        name: names.space,
        preset: "private_chat",
        creation_content: { type: "m.space" },
        invite: [member.userId],
    });
    const channelId = await createRoom(owner, {
        name: names.channel,
        preset: "private_chat",
        invite: [member.userId],
        initial_state: [{ type: "m.space.parent", state_key: spaceId, content: { canonical: true, via: ["localhost"] } }],
    });
    await sendState(owner, spaceId, "m.space.child", channelId, { via: ["localhost"], suggested: true });
    await joinRoom(member, spaceId);
    await joinRoom(member, channelId);
    return { spaceId, channelId };
}

export async function setDisplayName(user: ApiUser, displayName: string): Promise<void> {
    await request(user, "PUT", `/profile/${encodeURIComponent(user.userId)}/displayname`, { displayname: displayName });
}

export async function readEvents(
    user: ApiUser,
    roomId: string,
): Promise<Array<{ type: string; sender: string; content: Record<string, unknown> }>> {
    const { chunk } = await request<{ chunk: Array<{ type: string; sender: string; content: Record<string, unknown> }> }>(
        user,
        "GET",
        `/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`,
    );
    return chunk;
}

// Uploads a PNG and sends it as an m.sticker event, like any Matrix client would.
export async function sendStickerEvent(user: ApiUser, roomId: string, png: Uint8Array, body: string): Promise<void> {
    const upload = await fetch(`${SYNAPSE_URL}/_matrix/media/v3/upload?filename=sticker.png`, {
        method: "POST",
        headers: { "Content-Type": "image/png", Authorization: `Bearer ${user.accessToken}` },
        body: png,
    });
    if (!upload.ok) {
        throw new Error(`Sticker upload failed: HTTP ${upload.status} ${await upload.text()}`);
    }
    const { content_uri: url } = (await upload.json()) as { content_uri: string };
    await request(user, "PUT", `/rooms/${encodeURIComponent(roomId)}/send/m.sticker/${crypto.randomUUID()}`, {
        body,
        url,
        info: { w: 128, h: 128, mimetype: "image/png", size: png.byteLength },
    });
}

export async function setAccountData(user: ApiUser, type: string, content: unknown): Promise<void> {
    await request(user, "PUT", `/user/${encodeURIComponent(user.userId)}/account_data/${encodeURIComponent(type)}`, content);
}

export async function readProfileField(user: ApiUser, userId: string, key: string): Promise<unknown> {
    const body = await request<Record<string, unknown>>(user, "GET", `/profile/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`);
    return body[key];
}

export async function sendEvent(user: ApiUser, roomId: string, type: string, content: unknown): Promise<string> {
    const txnId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = await request<{ event_id: string }>(
        user,
        "PUT",
        `/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(type)}/${txnId}`,
        content,
    );
    return body.event_id;
}


export async function readState(user: ApiUser, roomId: string, type: string, stateKey = ""): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(user, "GET", `/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(type)}/${encodeURIComponent(stateKey)}`);
}

// The test Synapse's built-in admin (created by scripts/test-synapse.mjs with Synapse's own tool).
const TEST_ADMIN = { username: "e2e-admin", password: "e2e-admin-test-only-password" };

async function login(username: string, password: string): Promise<{ user_id: string; access_token: string }> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: username }, password }),
    });
    if (!response.ok) {
        throw new Error(`login ${username} failed: HTTP ${response.status} ${await response.text()}`);
    }
    return (await response.json()) as { user_id: string; access_token: string };
}

// A fresh server admin, created through the Admin API by the built-in admin.
export async function registerAdmin(prefix: string): Promise<ApiUser> {
    const admin = await login(TEST_ADMIN.username, TEST_ADMIN.password);
    const username = `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const password = `pw-${crypto.randomUUID()}`;
    const userId = `@${username}:${admin.user_id.split(":").slice(1).join(":")}`;
    const response = await fetch(`${SYNAPSE_URL}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.access_token}` },
        body: JSON.stringify({ password, admin: true }),
    });
    if (!response.ok) {
        throw new Error(`creating admin failed: HTTP ${response.status} ${await response.text()}`);
    }
    const session = await login(username, password);
    return { userId: session.user_id, username, password, accessToken: session.access_token };
}

// Synapse rate-limits presence changes (by default about one per 10 s): wait it out like the app does.
export async function setPresence(user: ApiUser, presence: "online" | "unavailable" | "offline", statusMsg?: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await request(user, "PUT", `/presence/${encodeURIComponent(user.userId)}/status`, { presence, ...(statusMsg ? { status_msg: statusMsg } : {}) });
            return;
        } catch (error) {
            const wait = /retry_after_ms":(\d+)/.exec(String(error))?.[1];
            if (!wait || attempt >= 3) throw error;
            await new Promise((resolve) => setTimeout(resolve, Number(wait) + 200));
        }
    }
}

export async function readPresence(user: ApiUser, userId: string): Promise<{ presence: string; status_msg?: string }> {
    return request(user, "GET", `/presence/${encodeURIComponent(userId)}/status`);
}

export async function setProfileField(user: ApiUser, key: string, value: unknown): Promise<void> {
    await request(user, "PUT", `/profile/${encodeURIComponent(user.userId)}/${encodeURIComponent(key)}`, { [key]: value });
}

export async function readAccountData(user: ApiUser, type: string): Promise<Record<string, unknown>> {
    return request(user, "GET", `/user/${encodeURIComponent(user.userId)}/account_data/${encodeURIComponent(type)}`);
}

export async function uploadMedia(user: ApiUser, data: Uint8Array, contentType: string, filename = "file"): Promise<string> {
    const upload = await fetch(`${SYNAPSE_URL}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": contentType, Authorization: `Bearer ${user.accessToken}` },
        body: data,
    });
    if (!upload.ok) throw new Error(`Upload failed: HTTP ${upload.status} ${await upload.text()}`);
    return ((await upload.json()) as { content_uri: string }).content_uri;
}

// Makes an existing user a server admin (through the built-in admin).
export async function makeServerAdmin(user: ApiUser): Promise<void> {
    const admin = await login(TEST_ADMIN.username, TEST_ADMIN.password);
    const response = await fetch(`${SYNAPSE_URL}/_synapse/admin/v1/users/${encodeURIComponent(user.userId)}/admin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.access_token}` },
        body: JSON.stringify({ admin: true }),
    });
    if (!response.ok) throw new Error(`making admin failed: HTTP ${response.status} ${await response.text()}`);
}

export async function canLogIn(username: string, password: string): Promise<boolean> {
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: username }, password }),
    });
    return response.ok;
}

export async function downloadMedia(user: ApiUser, mxc: string): Promise<Uint8Array> {
    const [serverName, mediaId] = mxc.replace("mxc://", "").split("/");
    const response = await fetch(`${SYNAPSE_URL}/_matrix/client/v1/media/download/${serverName}/${mediaId}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
}
