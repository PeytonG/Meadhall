// SPDX-License-Identifier: AGPL-3.0-only
// A local log of errors the app ran into (Settings → Logs), each with a plain-language hint when we know what it
// means. Kept on this device only (nothing is sent anywhere), capped to the most recent entries.

const KEY = "meadhall.error_log.v1";
const MAX_ENTRIES = 200;

export interface AppLogEntry {
    at: number;
    source: string;
    message: string;
}

const listeners = new Set<() => void>();

export function readAppLog(): AppLogEntry[] {
    try {
        const entries = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
        return Array.isArray(entries) ? (entries as AppLogEntry[]).filter((entry) => typeof entry?.at === "number") : [];
    } catch {
        return [];
    }
}

export function logAppError(source: string, error: unknown): void {
    const message = (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error)) ?? "";
    if (!message.trim()) return;
    try {
        const entries = readAppLog();
        const last = entries[entries.length - 1];
        // The same error repeating within a few seconds is one entry.
        if (last && last.message === message && last.source === source && Date.now() - last.at < 5_000) return;
        entries.push({ at: Date.now(), source, message: message.slice(0, 1000) });
        window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch {
        // Not recorded; the app is unaffected.
    }
    listeners.forEach((listener) => listener());
}

export function clearAppLog(): void {
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
    listeners.forEach((listener) => listener());
}

export function onAppLogChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// What an error usually means and what to do about it.
const HINTS: ReadonlyArray<[RegExp, string]> = [
    [/M_LIMIT_EXCEEDED|\b429\b|too many requests/i, "The server is limiting how fast you can do this. Wait a few seconds and try again."],
    [/M_UNKNOWN_TOKEN|soft.?logout|\b401\b/i, "Your sign-in expired. Sign out and sign in again."],
    [/M_FORBIDDEN|\b403\b|not allowed/i, "The server refused: you may not have permission for this (for example a role or room setting)."],
    [/failed to fetch|networkerror|network request failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|offline/i, "Couldn't reach the server. Check your internet connection and the server address."],
    [/pkexec|password prompt|dnf|apt-get/i, "Installing an update on Linux needs your password. Accept the prompt, or run the command shown by hand."],
    [/other device is unknown|verification/i, "Device verification needs both devices open: accept the request on the other one, then try again."],
    [/publishing silence|NotAllowedError|permission denied|microphone/i, "Meadhall can't hear your microphone. Check the selected input device and your system's microphone permission."],
    [/signal close|participant removed|duplicate identity|room deleted|server shutdown|call server|LiveKit/i, "The call server ended the connection. If it keeps happening, the server's LiveKit setup may need a look (see the self-hosting guide)."],
    [/membership/i, "Meadhall couldn't keep you in the call on the Matrix side; this is usually a server issue."],
    [/decrypt|megolm|olm|unable to decrypt/i, "A message couldn't be decrypted. Verifying this device or restoring your key backup usually fixes it."],
];

export function hintFor(message: string): string | null {
    return HINTS.find(([pattern]) => pattern.test(message))?.[1] ?? null;
}

let globalCaptureInstalled = false;

// Uncaught errors and failed promises anywhere in the page.
export function captureGlobalErrors(): void {
    if (globalCaptureInstalled || typeof window === "undefined") return;
    globalCaptureInstalled = true;
    window.addEventListener("error", (event) => logAppError("app", event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => logAppError("app", event.reason));
}
