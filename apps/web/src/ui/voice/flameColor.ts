// SPDX-License-Identifier: AGPL-3.0-only
// Each person's campfire (on/off and color) lives in their Matrix profile as a custom field (extended profiles,
// MSC4133, stable in Synapse), so everyone in a call sees the fire, or the plain green ring, its owner chose.
// Lookups are cached for a few minutes.
import { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { DEFAULT_FLAME_COLOR, normalizeFlameColor } from "./campfire";

export const FLAME_PROFILE_KEY = "io.github.peytong.meadhall.campfire";
const CACHE_MS = 5 * 60_000;

export interface FlameStyle {
    enabled: boolean;
    color: string;
}

export const DEFAULT_FLAME_STYLE: FlameStyle = { enabled: true, color: DEFAULT_FLAME_COLOR };

export function parseFlameStyle(value: unknown): FlameStyle {
    if (!value || typeof value !== "object") {
        return DEFAULT_FLAME_STYLE;
    }
    const record = value as { enabled?: unknown; color?: unknown };
    return {
        enabled: record.enabled !== false,
        color: normalizeFlameColor(record.color) ?? DEFAULT_FLAME_COLOR,
    };
}

interface CacheEntry {
    style: FlameStyle;
    fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<FlameStyle>>();
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

export async function fetchFlameStyle(client: MatrixClient, userId: string): Promise<FlameStyle> {
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
        return cached.style;
    }
    const pending = inFlight.get(userId);
    if (pending) {
        return pending;
    }
    const request = (async () => {
        let style = DEFAULT_FLAME_STYLE;
        try {
            style = parseFlameStyle(await client.getExtendedProfileProperty(userId, FLAME_PROFILE_KEY));
        } catch {
            // Not set, or the server has no extended profiles: the default fire.
        }
        cache.set(userId, { style, fetchedAt: Date.now() });
        inFlight.delete(userId);
        notify();
        return style;
    })();
    inFlight.set(userId, request);
    return request;
}

export async function saveOwnFlameStyle(client: MatrixClient, style: FlameStyle): Promise<void> {
    const normalized = parseFlameStyle(style);
    cache.set(client.getSafeUserId(), { style: normalized, fetchedAt: Date.now() });
    notify();
    await client.setExtendedProfileProperty(FLAME_PROFILE_KEY, normalized);
}

// A user's campfire choice, fetched once and shared by every avatar that shows it.
export function useFlameStyle(client: MatrixClient, userId: string | null | undefined): FlameStyle {
    const [, setVersion] = useState(0);
    useEffect(() => {
        const listener = (): void => setVersion((version) => version + 1);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);
    useEffect(() => {
        if (userId) {
            void fetchFlameStyle(client, userId);
        }
    }, [client, userId]);
    return (userId ? cache.get(userId)?.style : undefined) ?? DEFAULT_FLAME_STYLE;
}
