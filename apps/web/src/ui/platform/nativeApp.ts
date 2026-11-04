// SPDX-License-Identifier: AGPL-3.0-only
// The Android app's MeadhallNative plugin (apps/mobile/android): saving downloads and the system Back button.

import { isAndroidApp } from "../../core/platform/android";

interface ListenerHandle {
    remove(): Promise<void>;
}

interface MeadhallNativePlugin {
    saveDownload(options: { name: string; mimeType: string; base64: string }): Promise<{ folder: string; name: string }>;
    minimize(): Promise<void>;
    // Plugins reached through window.Capacitor.Plugins return the handle itself; registerPlugin() ones a promise.
    addListener(event: "backButton", listener: () => void): ListenerHandle | Promise<ListenerHandle>;
}

function plugin(): MeadhallNativePlugin | undefined {
    if (!isAndroidApp()) {
        return undefined;
    }
    return (window as unknown as { Capacitor?: { Plugins?: { MeadhallNative?: MeadhallNativePlugin } } }).Capacitor?.Plugins?.MeadhallNative;
}

export function canSaveNatively(): boolean {
    return Boolean(plugin());
}

export async function saveDownloadNatively(name: string, blob: Blob): Promise<{ folder: string; name: string }> {
    const native = plugin();
    if (!native) {
        throw new Error("Not in the Android app");
    }
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file"));
        reader.readAsDataURL(blob);
    });
    return native.saveDownload({ name, mimeType: blob.type || "application/octet-stream", base64 });
}

// The system Back button/gesture. Returns a cleanup function; does nothing outside the Android app.
export function onNativeBack(handler: () => void): () => void {
    const native = plugin();
    if (!native) {
        return () => undefined;
    }
    let handle: ListenerHandle | null = null;
    let removed = false;
    try {
        void Promise.resolve(native.addListener("backButton", handler))
            .then((added) => {
                if (removed) {
                    void added.remove();
                } else {
                    handle = added;
                }
            })
            .catch(() => undefined);
    } catch {
        // An older app without the plugin's listener: Back keeps Android's default.
    }
    return () => {
        removed = true;
        void Promise.resolve(handle?.remove()).catch(() => undefined);
    };
}

// Nothing left to go back to: put the app in the background, like Discord.
export function minimizeNativeApp(): void {
    void plugin()?.minimize().catch(() => undefined);
}
