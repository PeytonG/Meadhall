// SPDX-License-Identifier: AGPL-3.0-only
// Switching between signed-in accounts from the UI. The vault itself is core/storage/accounts.ts; every switch
// reloads the app, so the new account starts exactly like a normal app start.
import { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import {
    addingAccountFrom,
    loadVault,
    startAddingAccount,
    switchToAccount,
    type StoredAccount,
} from "../../core/storage/accounts";

// After a switch, the app opens this room once it's ready (e.g. a notification from another account was clicked).
export const PENDING_ROOM_KEY = "meadhall_open_room_after_switch";

function ownProfile(client: MatrixClient | null): { displayName?: string; avatarMxc?: string | null } {
    const userId = client?.getUserId();
    const user = userId ? client?.getUser(userId) : null;
    return { displayName: user?.displayName ?? userId ?? undefined, avatarMxc: user?.avatarUrl ?? null };
}

// Switching reloads the app, which ends a call: ask first while one is going (set by AppShell).
let inCall = false;

export function setInCallForSwitching(value: boolean): void {
    inCall = value;
}

function okToLeaveCall(): boolean {
    return !inCall || window.confirm("Switching accounts restarts Meadhall, which ends your call. Switch anyway?");
}

function reload(): void {
    window.location.reload();
}

export async function switchAccount(client: MatrixClient | null, userId: string, openRoomId?: string): Promise<void> {
    if (!okToLeaveCall()) return;
    client?.stopClient();
    await switchToAccount(userId, ownProfile(client));
    if (openRoomId) {
        try {
            window.localStorage.setItem(PENDING_ROOM_KEY, openRoomId);
        } catch {
            // Opens the account without jumping to the room.
        }
    }
    reload();
}

export async function addAccount(client: MatrixClient | null): Promise<void> {
    if (!okToLeaveCall()) return;
    client?.stopClient();
    await startAddingAccount(ownProfile(client));
    reload();
}

// From the sign-in screen while adding an account: go back to the one you came from.
export async function cancelAddingAccount(): Promise<void> {
    const from = addingAccountFrom();
    if (!from) return;
    await switchToAccount(from);
    reload();
}

export function takePendingRoom(): string | null {
    try {
        const roomId = window.localStorage.getItem(PENDING_ROOM_KEY);
        window.localStorage.removeItem(PENDING_ROOM_KEY);
        return roomId;
    } catch {
        return null;
    }
}

// The other signed-in accounts (not the active one).
export function useStoredAccounts(): StoredAccount[] {
    const [accounts, setAccounts] = useState<StoredAccount[]>([]);
    useEffect(() => {
        let cancelled = false;
        void loadVault().then((loaded) => {
            if (!cancelled) setAccounts(loaded);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return accounts;
}
