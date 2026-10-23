// SPDX-License-Identifier: AGPL-3.0-only
// "Automatic" status goes Away after 10 minutes without input and back to Online as soon as you return, like
// Discord. The desktop app asks the OS how long the whole computer has been idle (so typing in another app counts);
// elsewhere, input in Meadhall itself counts.

export const AWAY_AFTER_MS = 10 * 60_000;
const CHECK_EVERY_MS = 15_000;
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "focus"] as const;

export interface AwayTrackerOptions {
    awayAfterMs?: number;
    checkEveryMs?: number;
    // Milliseconds since the last input anywhere on the computer, when the platform can tell.
    systemIdleMs?: () => Promise<number | null>;
    now?: () => number;
    target?: Pick<Window, "addEventListener" | "removeEventListener">;
}

export function startAwayTracker(onChange: (away: boolean) => void, options: AwayTrackerOptions = {}): () => void {
    const awayAfterMs = options.awayAfterMs ?? AWAY_AFTER_MS;
    const now = options.now ?? Date.now;
    const target = options.target ?? window;
    let lastActivity = now();
    let away = false;
    const setAway = (next: boolean): void => {
        if (next !== away) {
            away = next;
            onChange(next);
        }
    };
    const check = async (): Promise<void> => {
        const systemIdle = (await options.systemIdleMs?.().catch(() => null)) ?? null;
        const idleMs = systemIdle === null ? now() - lastActivity : Math.min(systemIdle, now() - lastActivity);
        setAway(idleMs >= awayAfterMs);
    };
    const onActivity = (): void => {
        lastActivity = now();
        setAway(false);
    };
    for (const event of ACTIVITY_EVENTS) target.addEventListener(event, onActivity, { passive: true, capture: true });
    const timer = setInterval(() => void check(), options.checkEveryMs ?? CHECK_EVERY_MS);
    return () => {
        clearInterval(timer);
        for (const event of ACTIVITY_EVENTS) target.removeEventListener(event, onActivity, { capture: true });
    };
}
