// SPDX-License-Identifier: AGPL-3.0-only
// A real, end-to-end-encrypting Matrix client running in the test process (compiled matrix-js-sdk + Rust crypto),
// for scenarios the plain HTTP helpers can't produce, like encrypted events from another person.
import { ClientEvent, createClient, SyncState, type MatrixClient } from "matrix-js-sdk";

import { SYNAPSE_URL, type ApiUser } from "./matrixApi";

export async function startEncryptingClient(user: ApiUser): Promise<MatrixClient> {
    const whoami = (await (
        await fetch(`${SYNAPSE_URL}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    ).json()) as { device_id: string };
    const client = createClient({ baseUrl: SYNAPSE_URL, userId: user.userId, deviceId: whoami.device_id, accessToken: user.accessToken });
    await client.initRustCrypto({ useIndexedDB: false });
    const prepared = new Promise<void>((resolve, reject) => {
        client.on(ClientEvent.Sync, (state) => {
            if (state === SyncState.Prepared) resolve();
            if (state === SyncState.Error) reject(new Error(`initial sync failed for ${user.userId}`));
        });
    });
    await client.startClient({ initialSyncLimit: 5 });
    await prepared;
    return client;
}
