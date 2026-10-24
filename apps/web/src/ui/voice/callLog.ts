// SPDX-License-Identifier: AGPL-3.0-only
// A short local history of what happened to calls (joined, dropped and why, rejoined, left), shown in the call
// settings so an unexpected disconnect can be traced to the app, the network or the call server. Kept on this
// device only; nothing is sent anywhere.

const KEY = "meadhall.call_log.v1";
const MAX_ENTRIES = 60;

export interface CallLogEntry {
    at: number;
    event: string;
    detail?: string;
}

export function readCallLog(): CallLogEntry[] {
    try {
        const entries = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
        return Array.isArray(entries) ? (entries as CallLogEntry[]).filter((entry) => typeof entry?.at === "number") : [];
    } catch {
        return [];
    }
}

export function logCallEvent(event: string, detail?: string): void {
    try {
        const entries = [...readCallLog(), { at: Date.now(), event, ...(detail ? { detail: detail.slice(0, 300) } : {}) }];
        window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch {
        // Not recorded; the call itself is unaffected.
    }
}

export function formatCallLog(entries: CallLogEntry[]): string {
    return entries
        .map((entry) => `${new Date(entry.at).toLocaleString()}  ${entry.event}${entry.detail ? `: ${entry.detail}` : ""}`)
        .join("\n");
}

// Calls that ended without you choosing to (alone too long, dropped and couldn't rejoin, membership failed): the app
// shows a notice saying why, even if you've left the call view.
const endedListeners = new Set<(reason: string) => void>();

export function onCallEnded(listener: (reason: string) => void): () => void {
    endedListeners.add(listener);
    return () => endedListeners.delete(listener);
}

export function announceCallEnded(reason: string): void {
    endedListeners.forEach((listener) => listener(reason));
}

// Reconnecting after an unexpected drop: a few quick tries, then give up rather than loop forever.
export const RECONNECT_DELAYS_MS = [1_500, 4_000, 10_000];
