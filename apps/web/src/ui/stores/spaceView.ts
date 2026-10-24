// SPDX-License-Identifier: AGPL-3.0-only
// How you view each server, from its right-click menu: hide muted channels, show channels you haven't joined, and the
// order of servers in the rail. The view options stay on this device; the order is account data, so it follows you.
import { useSyncExternalStore } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

const VIEW_KEY = "meadhall.space_view.v1";
export const SPACE_ORDER_TYPE = "io.github.peytong.meadhall.space_order";

export interface SpaceViewOptions {
    hideMutedChannels: boolean;
    showAllChannels: boolean;
}

const DEFAULTS: SpaceViewOptions = { hideMutedChannels: false, showAllChannels: true };
const listeners = new Set<() => void>();
let cache: Record<string, SpaceViewOptions> | null = null;

function readAll(): Record<string, SpaceViewOptions> {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(VIEW_KEY) ?? "{}") as Record<string, Partial<SpaceViewOptions>>;
        cache = Object.fromEntries(Object.entries(parsed).map(([id, value]) => [id, { ...DEFAULTS, ...value }]));
    } catch {
        cache = {};
    }
    return cache;
}

export function getSpaceView(spaceId: string): SpaceViewOptions {
    return readAll()[spaceId] ?? DEFAULTS;
}

export function setSpaceView(spaceId: string, change: Partial<SpaceViewOptions>): void {
    cache = { ...readAll(), [spaceId]: { ...getSpaceView(spaceId), ...change } };
    try {
        window.localStorage.setItem(VIEW_KEY, JSON.stringify(cache));
    } catch {
        // Kept for this session only.
    }
    listeners.forEach((listener) => listener());
}

export function useSpaceView(spaceId: string): SpaceViewOptions {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        () => getSpaceView(spaceId),
        () => getSpaceView(spaceId),
    );
}

export function readSpaceOrder(client: MatrixClient): string[] {
    const order = client.getAccountData(SPACE_ORDER_TYPE as never)?.getContent()?.order;
    return Array.isArray(order) ? order.filter((id): id is string => typeof id === "string") : [];
}

// Servers in the saved order; ones not in it yet keep their (alphabetical) place after those.
export function orderSpaces<T extends { roomId: string }>(spaces: T[], order: string[]): T[] {
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...spaces].sort((left, right) => {
        const a = rank.get(left.roomId);
        const b = rank.get(right.roomId);
        if (a !== undefined && b !== undefined) return a - b;
        if (a !== undefined) return -1;
        if (b !== undefined) return 1;
        return 0;
    });
}

export function movedSpaceOrder(currentIds: string[], spaceId: string, to: "top" | "up" | "down" | "bottom"): string[] {
    const ids = currentIds.filter((id) => id !== spaceId);
    const index = currentIds.indexOf(spaceId);
    const target = to === "top" ? 0 : to === "bottom" ? ids.length : to === "up" ? Math.max(0, index - 1) : Math.min(ids.length, index + 1);
    ids.splice(target, 0, spaceId);
    return ids;
}

export async function saveSpaceOrder(client: MatrixClient, order: string[]): Promise<void> {
    await client.setAccountData(SPACE_ORDER_TYPE as never, { order } as never);
}
