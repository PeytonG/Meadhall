// SPDX-License-Identifier: AGPL-3.0-only
// Reduced motion: on when the system asks for it (prefers-reduced-motion) or when it's turned on in
// Settings → Appearance. Shown on the page as data-reduce-motion="on" (CSS stops animations with it).
import { useSyncExternalStore } from "react";

let appSetting = false;
const listeners = new Set<() => void>();

function systemPrefers(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function reducedMotion(): boolean {
    return appSetting || systemPrefers();
}

function apply(): void {
    if (typeof document !== "undefined") document.documentElement.setAttribute("data-reduce-motion", reducedMotion() ? "on" : "off");
    for (const listener of listeners) listener();
}

export function setReduceMotionSetting(enabled: boolean): void {
    appSetting = enabled;
    apply();
}

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", apply);
}

export function useReducedMotion(): boolean {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        reducedMotion,
    );
}
