// SPDX-License-Identifier: AGPL-3.0-only
// Announces refreshed access tokens. Sessions use refresh tokens, so Synapse access tokens expire after minutes;
// anything holding a copy (the desktop app's media request hook) must pick up each new one, or media loaded after
// the first refresh fails with 401 and shows as a broken image.

type Listener = (accessToken: string) => void;

const listeners = new Set<Listener>();

export function onAccessTokenRefreshed(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function announceAccessTokenRefreshed(accessToken: string): void {
    for (const listener of listeners) {
        try {
            listener(accessToken);
        } catch {
            // One failing listener must not stop the others.
        }
    }
}
