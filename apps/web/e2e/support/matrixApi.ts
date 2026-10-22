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
