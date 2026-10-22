// SPDX-License-Identifier: AGPL-3.0-only
// Android app: background notifications through the native MeadhallSync plugin (a foreground service that polls
// the homeserver's notification list; see apps/mobile/android). No Google services or extra apps needed.

import { isAndroidApp } from "../../core/platform/android";

interface MeadhallSyncPlugin {
    start(options: { homeserverUrl: string; accessToken: string; userId: string; showMessageText: boolean }): Promise<unknown>;
    updateToken(options: { accessToken: string }): Promise<void>;
    stop(): Promise<void>;
}

function plugin(): MeadhallSyncPlugin | undefined {
    if (!isAndroidApp()) {
        return undefined;
    }
    return (window as unknown as { Capacitor?: { Plugins?: { MeadhallSync?: MeadhallSyncPlugin } } }).Capacitor?.Plugins?.MeadhallSync;
}

export async function startAndroidBackgroundSync(options: {
    homeserverUrl: string;
    accessToken: string;
    userId: string;
    showMessageText: boolean;
}): Promise<void> {
    await plugin()?.start(options).catch(() => undefined);
}

export async function updateAndroidBackgroundSyncToken(accessToken: string): Promise<void> {
    await plugin()?.updateToken({ accessToken }).catch(() => undefined);
}

export async function stopAndroidBackgroundSync(): Promise<void> {
    await plugin()?.stop().catch(() => undefined);
}
