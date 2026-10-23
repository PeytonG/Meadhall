// SPDX-License-Identifier: AGPL-3.0-only
// Several signed-in accounts on one device (e.g. one on matrix.org and one on a self-hosted server).
//
// One account is active: it owns the usual session slots (mx_* in localStorage, tokens in IndexedDB) and runs the
// full client. The others wait in a vault (IndexedDB "account" table, key below) with their session slots copied
// as they were, tokens still encrypted with their own pickle keys. Switching swaps the slots and reloads the app.
// Each account keeps its own sync and crypto databases, named by a store prefix, so switching never loses
// encryption keys; the first account keeps the original names ("" prefix) so existing installs need no migration.
import type { AESEncryptedSecretStoragePayload } from "matrix-js-sdk/src/types";

import { idbDelete, idbLoad, idbSave } from "./storageAccess";
import {
    ACCESS_TOKEN_STORAGE_KEY,
    HAS_ACCESS_TOKEN_STORAGE_KEY,
    HAS_REFRESH_TOKEN_STORAGE_KEY,
    REFRESH_TOKEN_STORAGE_KEY,
} from "./tokens";

const VAULT_KEY = "meadhall_accounts";
export const STORE_PREFIX_KEY = "mx_store_prefix";
// The account to go back to if adding another one is cancelled.
const ADDING_FROM_KEY = "meadhall_adding_account_from";
// localStorage keys that make up a session (see sessionStore.ts), copied as-is.
const SESSION_KEYS = ["mx_hs_url", "mx_is_url", "mx_user_id", "mx_device_id", "mx_is_guest", "mx_has_pickle_key", HAS_ACCESS_TOKEN_STORAGE_KEY, HAS_REFRESH_TOKEN_STORAGE_KEY];

type TokenPayload = AESEncryptedSecretStoragePayload | string | undefined;

export interface StoredAccount {
    userId: string;
    deviceId: string;
    homeserverUrl: string;
    displayName: string;
    avatarMxc: string | null;
    storePrefix: string;
    localStorage: Record<string, string>;
    accessToken: TokenPayload;
    refreshToken: TokenPayload;
}

function storage(): Storage | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function activeStorePrefix(): string {
    return storage()?.getItem(STORE_PREFIX_KEY) ?? "";
}

// Database names for an account's stores. "" keeps the names every install already uses.
export function storeNames(prefix = activeStorePrefix()): { sync: string; crypto: string; legacyCrypto: string } {
    return prefix
        ? { sync: `meadhall-sync-${prefix}`, crypto: `meadhall-${prefix}`, legacyCrypto: `matrix-js-sdk:crypto-${prefix}` }
        : { sync: "riot-web-sync", crypto: "matrix-js-sdk", legacyCrypto: "matrix-js-sdk:crypto" };
}

export async function loadVault(): Promise<StoredAccount[]> {
    try {
        const accounts = await idbLoad<StoredAccount[]>("account", VAULT_KEY);
        return Array.isArray(accounts) ? accounts.filter((account) => account && typeof account.userId === "string") : [];
    } catch {
        return [];
    }
}

async function saveVault(accounts: StoredAccount[]): Promise<void> {
    await idbSave("account", VAULT_KEY, accounts);
}

// The active account's session, as it would be stored in the vault.
export async function snapshotActiveAccount(profile: { displayName?: string; avatarMxc?: string | null } = {}): Promise<StoredAccount | null> {
    const local = storage();
    const userId = local?.getItem("mx_user_id");
    if (!local || !userId) return null;
    const copied: Record<string, string> = {};
    for (const key of SESSION_KEYS) {
        const value = local.getItem(key);
        if (value !== null) copied[key] = value;
    }
    return {
        userId,
        deviceId: local.getItem("mx_device_id") ?? "",
        homeserverUrl: local.getItem("mx_hs_url") ?? "",
        displayName: profile.displayName || userId,
        avatarMxc: profile.avatarMxc ?? null,
        storePrefix: activeStorePrefix(),
        localStorage: copied,
        accessToken: await idbLoad<TokenPayload>("account", ACCESS_TOKEN_STORAGE_KEY).catch(() => undefined),
        refreshToken: await idbLoad<TokenPayload>("account", REFRESH_TOKEN_STORAGE_KEY).catch(() => undefined),
    };
}

// Empties the active session slots (not the account's databases or pickle key, which stay for switching back).
export async function clearActiveSlots(): Promise<void> {
    const local = storage();
    for (const key of SESSION_KEYS) local?.removeItem(key);
    local?.removeItem(STORE_PREFIX_KEY);
    await Promise.allSettled([idbDelete("account", ACCESS_TOKEN_STORAGE_KEY), idbDelete("account", REFRESH_TOKEN_STORAGE_KEY)]);
}

async function makeActive(account: StoredAccount): Promise<void> {
    await clearActiveSlots();
    const local = storage();
    for (const [key, value] of Object.entries(account.localStorage)) local?.setItem(key, value);
    if (account.storePrefix) local?.setItem(STORE_PREFIX_KEY, account.storePrefix);
    if (account.accessToken) await idbSave("account", ACCESS_TOKEN_STORAGE_KEY, account.accessToken);
    if (account.refreshToken) await idbSave("account", REFRESH_TOKEN_STORAGE_KEY, account.refreshToken);
}

async function stashActive(profile: { displayName?: string; avatarMxc?: string | null }): Promise<void> {
    const active = await snapshotActiveAccount(profile);
    if (!active) return;
    const vault = (await loadVault()).filter((account) => account.userId !== active.userId);
    await saveVault([...vault, active]);
}

// Puts the active account in the vault and makes `userId` active. The caller reloads the app.
export async function switchToAccount(userId: string, activeProfile: { displayName?: string; avatarMxc?: string | null } = {}): Promise<void> {
    const target = (await loadVault()).find((account) => account.userId === userId);
    if (!target) throw new Error("That account isn't signed in on this device any more.");
    await stashActive(activeProfile);
    await makeActive(target);
    await saveVault((await loadVault()).filter((account) => account.userId !== userId));
    storage()?.removeItem(ADDING_FROM_KEY);
}

function newStorePrefix(): string {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Moves the active account to the vault and leaves the slots empty for a new sign-in (with its own databases).
export async function startAddingAccount(activeProfile: { displayName?: string; avatarMxc?: string | null } = {}): Promise<void> {
    const activeUserId = storage()?.getItem("mx_user_id");
    await stashActive(activeProfile);
    await clearActiveSlots();
    storage()?.setItem(STORE_PREFIX_KEY, newStorePrefix());
    if (activeUserId) storage()?.setItem(ADDING_FROM_KEY, activeUserId);
}

// While adding an account: the one to return to if the person changes their mind.
export function addingAccountFrom(): string | null {
    return storage()?.getItem(ADDING_FROM_KEY) ?? null;
}

export function finishAddingAccount(): void {
    storage()?.removeItem(ADDING_FROM_KEY);
}

// After the active account signs out: the next stored account becomes active (or null if there is none).
export async function activateNextAccount(): Promise<StoredAccount | null> {
    const [next] = await loadVault();
    if (!next) {
        await clearActiveSlots();
        return null;
    }
    await makeActive(next);
    await saveVault((await loadVault()).filter((account) => account.userId !== next.userId));
    return next;
}

// Keeps a stored account's tokens current (background notification checks refresh them).
export async function updateStoredTokens(userId: string, accessToken: TokenPayload, refreshToken: TokenPayload): Promise<void> {
    const vault = await loadVault();
    await saveVault(vault.map((account) => (account.userId === userId ? { ...account, accessToken, refreshToken } : account)));
}

export async function forgetStoredAccount(userId: string): Promise<void> {
    await saveVault((await loadVault()).filter((account) => account.userId !== userId));
}
