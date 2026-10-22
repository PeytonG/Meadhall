// SPDX-License-Identifier: AGPL-3.0-only
import { ClientEvent, SyncState, createClient, type MatrixClient } from "matrix-js-sdk/src/matrix";

// Synapse started by scripts/test-synapse.mjs (open registration, server name "localhost").
export const SYNAPSE_URL = process.env.SYNAPSE_URL ?? "http://localhost:8008";

export interface TestUser {
    userId: string;
    deviceId: string;
    accessToken: string;
    password: string;
}

export async function registerUser(prefix: string): Promise<TestUser> {
    const username = `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;
    const password = `pw-${crypto.randomUUID()}`;
    const url = `${SYNAPSE_URL}/_matrix/client/v3/register`;
    const body = { username, password, initial_device_display_name: "Meadhall integration test" };
    const post = (payload: unknown): Promise<Response> =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    let response = await post(body);
    if (response.status === 401) {
        const { session } = (await response.json()) as { session: string };
        response = await post({ ...body, auth: { type: "m.login.dummy", session } });
    }
    if (!response.ok) {
        throw new Error(`Registering ${username} failed: HTTP ${response.status} ${await response.text()}`);
    }
    const json = (await response.json()) as { user_id: string; device_id: string; access_token: string };
    return { userId: json.user_id, deviceId: json.device_id, accessToken: json.access_token, password };
}

const startedClients = new Set<MatrixClient>();

export async function startClient(user: TestUser, options: { crypto?: boolean } = {}): Promise<MatrixClient> {
    const client = createClient({
        baseUrl: SYNAPSE_URL,
        userId: user.userId,
        deviceId: user.deviceId,
        accessToken: user.accessToken,
    });
    if (options.crypto) {
        await client.initRustCrypto({ useIndexedDB: false });
    }

    const prepared = new Promise<void>((resolve, reject) => {
        client.on(ClientEvent.Sync, (state) => {
            if (state === SyncState.Prepared) resolve();
            if (state === SyncState.Error) reject(new Error(`Initial sync failed for ${user.userId}`));
        });
    });
    await client.startClient({ initialSyncLimit: 20 });
    await prepared;
    startedClients.add(client);
    return client;
}

export function stopAllClients(): void {
    for (const client of startedClients) {
        client.stopClient();
    }
    startedClients.clear();
}

export async function waitFor<T>(
    probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
    description: string,
    timeoutMs = 30_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await probe();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
}
