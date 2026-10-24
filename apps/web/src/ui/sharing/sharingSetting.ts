// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Privacy & Safety → Sharing: share and adopt soundboard sounds and style profiles. Off by default.
import { useSyncExternalStore } from "react";

const KEY = "meadhall.sharing_enabled.v1";
const listeners = new Set<() => void>();

export function isSharingEnabled(): boolean {
    try {
        return window.localStorage.getItem(KEY) === "on";
    } catch {
        return false;
    }
}

export function setSharingEnabled(enabled: boolean): void {
    try {
        window.localStorage.setItem(KEY, enabled ? "on" : "off");
    } catch {
        // This session only.
    }
    listeners.forEach((listener) => listener());
}

export function useSharingEnabled(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        isSharingEnabled,
        isSharingEnabled,
    );
}
