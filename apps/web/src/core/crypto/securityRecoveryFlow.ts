import type { GeneratedSecretStorageKey } from "matrix-js-sdk/src/crypto-api";
import { decodeRecoveryKey } from "matrix-js-sdk/src/crypto-api/recovery-key";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { withSecretStorageKeyProvider } from "../client/cryptoCallbacks";

export type RecoveryCredentialType = "recovery_key";
export type SecurityRecoveryFlow = "restore" | "setup";

export type AutomaticRecoveryStatus = "not_supported" | "no_backup" | "restored" | "needs_recovery_key";

export interface AutomaticRecoveryResult {
    status: AutomaticRecoveryStatus;
    error?: string;
    backupVersion: string | null;
}

interface BackupInfoLike {
    version?: string;
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function normalizeErrorMessage(message: string): string {
    return message.replace(/\s+/g, " ").trim();
}

function requiresManualRecoveryKey(message: string): boolean {
    const lowered = message.toLowerCase();
    return (
        lowered.includes("decryption key") ||
        lowered.includes("secret storage") ||
        lowered.includes("no backup info") ||
        lowered.includes("not found") ||
        lowered.includes("callback")
    );
}

export async function attemptAutomaticKeyBackupRestore(client: MatrixClient): Promise<AutomaticRecoveryResult> {
    const crypto = client.getCrypto();
    if (!crypto) {
        return {
            status: "not_supported",
            backupVersion: null,
        };
    }

    const backupInfo = (await crypto.getKeyBackupInfo()) as BackupInfoLike | null;
    if (!backupInfo?.version) {
        return {
            status: "no_backup",
            backupVersion: null,
        };
    }

    try {
        await crypto.restoreKeyBackup();
        return {
            status: "restored",
            backupVersion: backupInfo.version,
        };
    } catch {
        // Continue with secret-storage-based recovery.
    }

    const has4S = await client.secretStorage.hasKey();
    const backupKeyStored = has4S ? await client.isKeyBackupKeyStored() : null;
    if (!backupKeyStored) {
        return {
            status: "needs_recovery_key",
            backupVersion: backupInfo.version,
        };
    }

    try {
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
        await crypto.restoreKeyBackup();
        return {
            status: "restored",
            backupVersion: backupInfo.version,
        };
    } catch (error) {
        const message = normalizeErrorMessage(toErrorMessage(error));
        if (requiresManualRecoveryKey(message)) {
            return {
                status: "needs_recovery_key",
                error: message,
                backupVersion: backupInfo.version,
            };
        }

        return {
            status: "needs_recovery_key",
            error: `Automatic key restore failed: ${message}`,
            backupVersion: backupInfo.version,
        };
    }
}

export function isRecoveryKeyValid(recoveryKey: string): boolean {
    try {
        decodeRecoveryKey(recoveryKey);
        return true;
    } catch {
        return false;
    }
}

export async function restoreKeyBackupWithRecoveryKey(
    client: MatrixClient,
    recoveryKey: string,
    backupVersion?: string | null,
): Promise<void> {
    const crypto = client.getCrypto();
    if (!crypto) {
        return;
    }

    const trimmedKey = recoveryKey.trim();
    if (!trimmedKey) {
        throw new Error("Recovery key is required.");
    }

    const resolvedBackupVersion = backupVersion ?? (await crypto.getKeyBackupInfo())?.version ?? null;
    if (!resolvedBackupVersion) {
        throw new Error("No key backup is available on the homeserver.");
    }

    const decodedKey = decodeRecoveryKey(trimmedKey);
    try {
        await crypto.storeSessionBackupPrivateKey(decodedKey, resolvedBackupVersion);
        await crypto.restoreKeyBackup();
    } catch (error) {
        const message = toErrorMessage(error).toLowerCase();
        const keyMismatch = message.includes("key backup on server does not match the decryption key");
        if (!keyMismatch) {
            throw error;
        }

        const latestVersion = (await crypto.getKeyBackupInfo())?.version ?? null;
        if (!latestVersion || latestVersion === resolvedBackupVersion) {
            throw error;
        }

        await crypto.storeSessionBackupPrivateKey(decodedKey, latestVersion);
        await crypto.restoreKeyBackup();
    }
}

export async function restoreKeyBackupWithSecretStorageCredential(
    client: MatrixClient,
    credential: string,
): Promise<void> {
    const crypto = client.getCrypto();
    if (!crypto) {
        return;
    }

    const trimmedCredential = credential.trim();
    if (!trimmedCredential) {
        throw new Error("Security key is required.");
    }

    const secretStorage = client.secretStorage as unknown as {
        getDefaultKeyId: () => Promise<string | null>;
        checkKey: (key: Uint8Array<ArrayBuffer>, info: unknown) => Promise<boolean>;
    };

    const keyInfos = (await client.isKeyBackupKeyStored()) as Record<string, unknown> | null;
    if (!keyInfos || Object.keys(keyInfos).length === 0) {
        throw new Error("No key backup secret is stored in secret storage.");
    }

    const defaultKeyId = await secretStorage.getDefaultKeyId();
    const selectedKeyId = defaultKeyId && keyInfos[defaultKeyId] ? defaultKeyId : Object.keys(keyInfos)[0];
    const selectedKeyInfo = keyInfos[selectedKeyId];
    const privateKey = decodeRecoveryKey(trimmedCredential);

    try {
        const isValidForSecretStorage = await secretStorage.checkKey(privateKey, selectedKeyInfo);
        if (!isValidForSecretStorage) {
            throw new Error("Provided security key does not unlock secret storage.");
        }

        await withSecretStorageKeyProvider(
            async ({ keyIds }) => {
                const resolvedKeyId = keyIds.includes(selectedKeyId) ? selectedKeyId : keyIds[0];
                if (!resolvedKeyId) {
                    throw new Error("No matching secret storage key IDs available.");
                }

                return [resolvedKeyId, privateKey];
            },
            async () => {
                await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
                await crypto.restoreKeyBackup();
            },
        );
    } finally {
        privateKey.fill(0);
    }
}

export function triggerRoomHistoryDecryption(client: MatrixClient): void {
    for (const room of client.getRooms()) {
        const decryptAllEvents = (room as Room & { decryptAllEvents?: () => void }).decryptAllEvents;
        decryptAllEvents?.call(room);
    }
}

export async function createSecretStorageSetupKey(client: MatrixClient): Promise<GeneratedSecretStorageKey> {
    const crypto = client.getCrypto();
    if (!crypto) {
        throw new Error("Encryption is not available for this session.");
    }

    const generatedKey = await crypto.createRecoveryKeyFromPassphrase(undefined);
    if (!generatedKey.encodedPrivateKey || generatedKey.encodedPrivateKey.trim().length === 0) {
        generatedKey.privateKey.fill(0);
        throw new Error("Failed to generate a valid security key.");
    }

    return generatedKey;
}

export async function bootstrapSecretStorageSetup(
    client: MatrixClient,
    secretStorageKey: GeneratedSecretStorageKey,
): Promise<void> {
    const crypto = client.getCrypto();
    if (!crypto) {
        throw new Error("Encryption is not available for this session.");
    }

    // A recovery key made in another app (Element, FluffyChat...) guards your cross-signing keys. Replacing it from a
    // session that doesn't hold those keys would lock them away for good, and your other apps would stop trusting
    // new sessions: use the existing key instead.
    if ((await client.secretStorage.hasKey()) && !(await hasCrossSigningKeysLocally(client))) {
        throw new Error(EXISTING_RECOVERY_KEY_MESSAGE);
    }
    // No cross-signing identity on the account yet (a Meadhall-only account): create one along with the recovery
    // key, so your sessions can vouch for each other. Never when one exists, which would reset it everywhere.
    const userId = client.getUserId();
    const needsCrossSigning = Boolean(userId) && !(await crypto.userHasCrossSigningKeys(userId ?? undefined, true));

    const backupInfo = await crypto.getKeyBackupInfo();
    await withSecretStorageKeyProvider(
        async ({ keyIds }) => {
            const firstRequestedKeyId = keyIds[0];
            if (!firstRequestedKeyId) {
                throw new Error("No secret storage key IDs available for setup.");
            }

            return [firstRequestedKeyId, secretStorageKey.privateKey];
        },
        async () => {
            await crypto.bootstrapSecretStorage({
                createSecretStorageKey: async () => secretStorageKey,
                setupNewSecretStorage: true,
                setupNewKeyBackup: !backupInfo?.version,
            });
            if (needsCrossSigning) {
                // The first upload of signing keys needs no password (the account has none yet); the new keys are
                // saved under the recovery key just made, and this session is signed with them.
                await crypto.bootstrapCrossSigning({});
            }
        },
    );
}

export const EXISTING_RECOVERY_KEY_MESSAGE =
    "Your account already has a recovery key (set up in Meadhall or another app). Enter that key to restore this session, or verify it from another session, before changing it.";

async function hasCrossSigningKeysLocally(client: MatrixClient): Promise<boolean> {
    const status = await client.getCrypto()?.getCrossSigningStatus();
    const local = status?.privateKeysCachedLocally;
    return Boolean(local?.masterKey && local.selfSigningKey && local.userSigningKey);
}

// Cross-signing: other apps trust a session when it carries a signature from your account's self-signing key. With
// the recovery key, fetch your cross-signing keys from secret storage (where Element, FluffyChat and Meadhall keep
// them) and sign this session, so it shows as verified everywhere and trusts your other sessions in turn.
// Returns whether this session ends up signed. Never creates new keys.
export async function adoptCrossSigningWithRecoveryKey(client: MatrixClient, recoveryKey: string): Promise<boolean> {
    const crypto = client.getCrypto();
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (!crypto || !userId || !deviceId) {
        return false;
    }

    const status = await crypto.getCrossSigningStatus();
    if (!(await hasCrossSigningKeysLocally(client))) {
        if (!status.privateKeysInSecretStorage) {
            return false;
        }
        const keyId = await client.secretStorage.getDefaultKeyId();
        const keyDescription = keyId ? await client.secretStorage.getKey(keyId) : null;
        if (!keyId || !keyDescription) {
            return false;
        }
        let privateKey: Uint8Array<ArrayBuffer>;
        try {
            privateKey = decodeRecoveryKey(recoveryKey.trim());
        } catch {
            return false;
        }
        try {
            if (!(await client.secretStorage.checkKey(privateKey, keyDescription[1]))) {
                return false;
            }
            // The keys are in secret storage and not here, so this imports them and signs this session (it only
            // makes new keys when there are none in secret storage, which was checked above).
            await withSecretStorageKeyProvider(
                async ({ keyIds }) => (keyIds.includes(keyId) ? [keyId, privateKey] : null),
                async () => {
                    await crypto.bootstrapCrossSigning({});
                },
            );
        } finally {
            privateKey.fill(0);
        }
    }

    return signThisSessionIfNeeded(client);
}

// With the cross-signing keys here, make sure this session carries their signature (other apps look for it).
export async function signThisSessionIfNeeded(client: MatrixClient): Promise<boolean> {
    const crypto = client.getCrypto();
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (!crypto || !userId || !deviceId) {
        return false;
    }
    const signedByOwner = async (): Promise<boolean> =>
        Boolean((await crypto.getDeviceVerificationStatus(userId, deviceId))?.signedByOwner);
    // A signature just uploaded (here or by bootstrapping) only shows once our own keys are fetched again; asking
    // whether we have cross-signing keys, with downloading allowed, does that.
    const refreshOwnKeys = async (): Promise<void> => {
        await crypto.userHasCrossSigningKeys(userId, true);
    };
    if (await signedByOwner()) {
        return true;
    }
    if (!(await hasCrossSigningKeysLocally(client)) || !(await crypto.isCrossSigningReady())) {
        return false;
    }
    await refreshOwnKeys();
    if (await signedByOwner()) {
        return true;
    }
    await crypto.crossSignDevice(deviceId);
    await refreshOwnKeys();
    return signedByOwner();
}

// What other apps see: is this session signed by your account's cross-signing identity, and does this session
// trust that identity (so it can tell which of your other sessions are really yours)?
export interface SessionTrust {
    signedByAccount: boolean;
    trustsAccount: boolean;
    accountHasCrossSigning: boolean;
}

export async function getSessionTrust(client: MatrixClient): Promise<SessionTrust> {
    const crypto = client.getCrypto();
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (!crypto || !userId || !deviceId) {
        return { signedByAccount: false, trustsAccount: false, accountHasCrossSigning: false };
    }
    const [deviceStatus, identity] = await Promise.all([
        crypto.getDeviceVerificationStatus(userId, deviceId),
        crypto.getUserVerificationStatus(userId),
    ]);
    const accountHasCrossSigning = (await crypto.getCrossSigningStatus()).publicKeysOnDevice;
    return {
        signedByAccount: Boolean(deviceStatus?.signedByOwner),
        trustsAccount: identity.isCrossSigningVerified(),
        accountHasCrossSigning,
    };
}

