// SPDX-License-Identifier: AGPL-3.0-only
// A real, end-to-end-encrypting Matrix client running in the test process (compiled matrix-js-sdk + Rust crypto),
// for scenarios the plain HTTP helpers can't produce, like encrypted events from another person, or another app
// (Element, FluffyChat) signed in to the same account.
import { ClientEvent, createClient, SyncState, type MatrixClient } from "matrix-js-sdk";

import { SYNAPSE_URL, type ApiUser } from "./matrixApi";

export async function startEncryptingClient(user: ApiUser): Promise<MatrixClient> {
    const whoami = (await (
        await fetch(`${SYNAPSE_URL}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${user.accessToken}` } })
    ).json()) as { device_id: string };
    // Secret storage keys this client made, so it can read back what it stored (an app would ask for the key).
    const secretStorageKeys = new Map<string, Uint8Array<ArrayBuffer>>();
    const client = createClient({
        baseUrl: SYNAPSE_URL,
        userId: user.userId,
        deviceId: whoami.device_id,
        accessToken: user.accessToken,
        cryptoCallbacks: {
            getSecretStorageKey: async ({ keys }) => {
                const keyId = Object.keys(keys).find((id) => secretStorageKeys.has(id));
                return keyId ? [keyId, secretStorageKeys.get(keyId)!] : null;
            },
            cacheSecretStorageKey: (keyId, _keyInfo, key) => {
                secretStorageKeys.set(keyId, key);
            },
        },
    });
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

// What Element or FluffyChat do when you set up encryption: cross-signing keys, a recovery key guarding them in
// secret storage, and a message key backup. Returns the recovery key the person would have written down.
export async function setUpEncryptionLikeAnotherApp(client: MatrixClient, user: ApiUser, { keyBackup = true } = {}): Promise<string> {
    const crypto = client.getCrypto()!;
    const recoveryKey = await crypto.createRecoveryKeyFromPassphrase();
    await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async (makeRequest) => {
            await makeRequest({ type: "m.login.password", identifier: { type: "m.id.user", user: user.userId }, password: user.password });
        },
    });
    await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => recoveryKey,
        setupNewSecretStorage: true,
        setupNewKeyBackup: keyBackup,
    });
    return recoveryKey.encodedPrivateKey!;
}
