// SPDX-License-Identifier: AGPL-3.0-only
// Leave a call after being the only one in it for a while (like Discord), so a forgotten call doesn't keep the
// microphone open or keep showing you "in voice" to everyone.

export const ALONE_TIMEOUT_MS = 5 * 60_000;
export const ALONE_LEFT_MESSAGE = "You left the call because nobody else was in it for 5 minutes.";

export interface AloneWatcher {
    // Call whenever the call or its participants change.
    update: (connected: boolean, othersInCall: number) => void;
    dispose: () => void;
}

export function createAloneWatcher(onTimeout: () => void, timeoutMs = ALONE_TIMEOUT_MS): AloneWatcher {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return {
        update: (connected, othersInCall) => {
            if (!connected || othersInCall > 0) {
                stop();
            } else if (timer === null) {
                timer = setTimeout(() => {
                    timer = null;
                    onTimeout();
                }, timeoutMs);
            }
        },
        dispose: stop,
    };
}
