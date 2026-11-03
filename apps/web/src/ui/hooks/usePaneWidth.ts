// SPDX-License-Identifier: AGPL-3.0-only
// A side panel whose width you drag, like Discord's channel list and member list: remembered per panel, kept within
// its limits, and never so wide that the chat gets squeezed.
import { useCallback, useState } from "react";

interface PaneWidthOptions {
    storageKey: string;
    min: number;
    max: number;
    fallback: number;
    // Which way dragging widens it: the left panel grows to the right (+1), the right panel to the left (-1).
    direction: 1 | -1;
    // The most this panel may take right now (so the chat keeps its room), worked out when a drag starts.
    roomLeft?: () => number;
}

function readWidth({ storageKey, min, max, fallback }: PaneWidthOptions): number {
    try {
        const stored = Number(window.localStorage.getItem(storageKey));
        if (stored && Number.isFinite(stored)) return Math.min(max, Math.max(min, stored));
    } catch {
        // Storage blocked: the default width.
    }
    return fallback;
}

export function usePaneWidth(options: PaneWidthOptions): {
    width: number;
    resizing: boolean;
    onResizeStart: (event: React.PointerEvent<HTMLElement>) => void;
} {
    const [width, setWidth] = useState(() => readWidth(options));
    const [resizing, setResizing] = useState(false);
    const { storageKey, min, max, direction, roomLeft } = options;

    const onResizeStart = useCallback(
        (event: React.PointerEvent<HTMLElement>): void => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = width;
            const limit = Math.max(min, Math.min(max, roomLeft ? roomLeft() + startWidth : max));
            const widthAt = (clientX: number): number => Math.min(limit, Math.max(min, startWidth + direction * (clientX - startX)));
            setResizing(true);

            const onMove = (moveEvent: PointerEvent): void => setWidth(widthAt(moveEvent.clientX));
            const onUp = (upEvent: PointerEvent): void => {
                const final = widthAt(upEvent.clientX);
                setWidth(final);
                try {
                    window.localStorage.setItem(storageKey, String(Math.round(final)));
                } catch {
                    // Not remembered; fine.
                }
                setResizing(false);
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        },
        [direction, max, min, roomLeft, storageKey, width],
    );

    return { width, resizing, onResizeStart };
}
