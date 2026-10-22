// SPDX-License-Identifier: AGPL-3.0-only
// True inside the Android app (Capacitor).
export function isAndroidApp(): boolean {
    if (typeof window === "undefined") {
        return false;
    }
    const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return capacitor?.getPlatform?.() === "android";
}

// Sessions normally use refresh tokens (short-lived access tokens). The Android app's background notifications
// keep polling for hours while the app itself is asleep and can't refresh, so Android sessions use a long-lived
// access token instead, like Element Android.
export function wantsRefreshTokens(): boolean {
    return !isAndroidApp();
}
