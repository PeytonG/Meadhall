// SPDX-License-Identifier: AGPL-3.0-only
// Someone's profile style (card gradient, nameplate), cached for 10 minutes; your own updates show at once.
import { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { EMPTY_PROFILE_STYLE, STYLE_KEY, parseProfileStyle, type ProfileStyle } from "../../core/profile/profileStyle";

const cache = new Map<string, { at: number; value: Promise<ProfileStyle> }>();
const listeners = new Set<() => void>();
const TTL_MS = 10 * 60_000;

export function readProfileStyle(client: MatrixClient, userId: string, maxAgeMs = TTL_MS): Promise<ProfileStyle> {
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached.value;
    const value = client
        .getExtendedProfileProperty(userId, STYLE_KEY)
        .then(parseProfileStyle)
        .catch(() => EMPTY_PROFILE_STYLE);
    cache.set(userId, { at: Date.now(), value });
    return value;
}

export async function saveOwnProfileStyle(client: MatrixClient, style: ProfileStyle): Promise<void> {
    const userId = client.getSafeUserId();
    if (!style.card && !style.nameplate) await client.deleteExtendedProfileProperty(STYLE_KEY);
    else await client.setExtendedProfileProperty(STYLE_KEY, style as never);
    cache.set(userId, { at: Date.now(), value: Promise.resolve(style) });
    listeners.forEach((listener) => listener());
}

// `fresh`: re-read it now (opening someone's profile shows their current card; the cached one shows meanwhile).
export function useProfileStyle(client: MatrixClient, userId: string | null | undefined, fresh = false): ProfileStyle {
    const [style, setStyle] = useState<ProfileStyle>(EMPTY_PROFILE_STYLE);
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const listener = (): void => setVersion((value) => value + 1);
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }, []);
    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        const cached = cache.get(userId);
        if (fresh && cached) {
            void cached.value.then((value) => {
                if (!cancelled) setStyle(value);
            });
        }
        void readProfileStyle(client, userId, fresh ? 5_000 : TTL_MS).then((value) => {
            if (!cancelled) setStyle(value);
        });
        return () => {
            cancelled = true;
        };
    }, [client, userId, version, fresh]);
    return style;
}
