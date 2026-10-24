// SPDX-License-Identifier: AGPL-3.0-only
import type { HeorotDesktopCaptureSource } from "../types/heorotDesktop";

// Fills previews (and icons) into the picker's list as they arrive, keeping its order and anything already shown.
export function mergeCapturePreviews(
    current: HeorotDesktopCaptureSource[],
    withPreviews: HeorotDesktopCaptureSource[],
): HeorotDesktopCaptureSource[] {
    const byId = new Map(withPreviews.map((source) => [source.id, source]));
    return current.map((source) => {
        const found = byId.get(source.id);
        return found ? { ...source, thumbnail: found.thumbnail ?? source.thumbnail ?? null, icon: found.icon ?? source.icon ?? null } : source;
    });
}
