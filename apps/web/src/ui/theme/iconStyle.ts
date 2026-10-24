// SPDX-License-Identifier: AGPL-3.0-only
// Icon style (Settings → Appearance): pixel art (the default, matching the theme) or smooth line icons. A tiny store so
// every icon re-renders when the setting changes.
import { useSyncExternalStore } from "react";

export type IconStyle = "pixel" | "smooth";

let current: IconStyle = "pixel";
const listeners = new Set<() => void>();

export function setIconStyle(style: IconStyle): void {
    if (style === current) return;
    current = style;
    listeners.forEach((listener) => listener());
}

export function useIconStyle(): IconStyle {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => current,
        () => current,
    );
}
