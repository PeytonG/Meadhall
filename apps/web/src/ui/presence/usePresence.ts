import { useEffect, useMemo, useRef, useState } from "react";
import { UserEvent, type MatrixClient, type User } from "matrix-js-sdk/src/matrix";

import { buildPresenceVm, type PresenceVm } from "./buildPresenceVm";
import { cachedPublishedStatus, onPublishedStatusChange, refreshPublishedStatus } from "./clientStatus";
import { serverSharesPresence } from "./presenceSupport";

function sanitizeUserIds(userIds: string[]): string[] {
    const unique = new Set<string>();
    const out: string[] = [];
    for (const userId of userIds) {
        if (typeof userId !== "string" || userId.length === 0 || unique.has(userId)) {
            continue;
        }
        unique.add(userId);
        out.push(userId);
    }
    return out;
}

// Someone shown online only drops to offline once they've stayed offline this long. A sync that restarts (a
// reconnect, a refreshed session) rebuilds everyone's user info before their presence arrives again, which made
// every dot, yours included, blink offline for a moment. Homeservers take 30 s or more to report a real sign-off,
// so this hides only the blink.
export const OFFLINE_GRACE_MS = 4_000;

const isAway = (vm: PresenceVm): boolean => vm.state === "offline" || vm.state === "unknown";

interface ShownPresence {
    vm: PresenceVm;
    // When the source first said offline while we kept showing the last state.
    droppedAt: number | null;
}

// The presence to show now, given what was shown before; also says whether it's holding an old state.
export function withOfflineGrace(fresh: PresenceVm, shown: ShownPresence | undefined, now: number): { next: ShownPresence; holding: boolean } {
    if (!isAway(fresh) || !shown || isAway(shown.vm)) return { next: { vm: fresh, droppedAt: null }, holding: false };
    const droppedAt = shown.droppedAt ?? now;
    if (now - droppedAt < OFFLINE_GRACE_MS) return { next: { vm: shown.vm, droppedAt }, holding: true };
    return { next: { vm: fresh, droppedAt: null }, holding: false };
}

export function usePresenceMap(
    client: MatrixClient | null,
    userIds: string[],
    enabled: boolean,
): Map<string, PresenceVm> {
    const idsKey = useMemo(() => userIds.join("\u0000"), [userIds]);
    const normalizedUserIds = useMemo(() => sanitizeUserIds(userIds), [idsKey]);
    const normalizedIdsKey = useMemo(() => normalizedUserIds.join("\u0000"), [normalizedUserIds]);
    const [revision, setRevision] = useState(0);
    const shownRef = useRef(new Map<string, ShownPresence>());

    useEffect(() => {
        if (!client || !enabled || normalizedUserIds.length === 0) {
            return undefined;
        }

        const trackedUsers = new Set(normalizedUserIds);
        for (const userId of normalizedUserIds) {
            refreshPublishedStatus(client, userId);
        }
        const onPresenceUpdate = (_event: unknown, user: User): void => {
            if (!user?.userId || !trackedUsers.has(user.userId)) {
                return;
            }
            // A presence change may come with a new DND/mobile status: re-read it.
            refreshPublishedStatus(client, user.userId, true);
            setRevision((value) => value + 1);
        };
        const stopListening = onPublishedStatusChange(() => setRevision((value) => value + 1));
        // Do Not Disturb can change without a presence change (Away → DND), so re-read now and then too (the cache
        // makes this a no-op for anyone read within the last minute). Capped so a huge member list stays cheap.
        const refreshTimer = window.setInterval(() => {
            for (const userId of normalizedUserIds.slice(0, 50)) refreshPublishedStatus(client, userId);
        }, 60_000);

        client.on(UserEvent.Presence, onPresenceUpdate as any);
        client.on(UserEvent.CurrentlyActive, onPresenceUpdate as any);
        return () => {
            window.clearInterval(refreshTimer);
            stopListening();
            client.removeListener(UserEvent.Presence, onPresenceUpdate as any);
            client.removeListener(UserEvent.CurrentlyActive, onPresenceUpdate as any);
        };
    }, [client, enabled, normalizedIdsKey, normalizedUserIds]);

    const output = useMemo(() => {
        const result = new Map<string, PresenceVm>();
        let anyHeld = false;
        if (!client || !enabled || normalizedUserIds.length === 0) {
            return { result, anyHeld };
        }

        const now = Date.now();
        for (const userId of normalizedUserIds) {
            const user = client.getUser(userId);
            const fresh = buildPresenceVm({
                presence: user?.presence,
                currentlyActive: user?.currentlyActive,
                lastActiveAgo: user?.lastActiveAgo,
                statusMessage: user?.presenceStatusMsg,
                published: cachedPublishedStatus(userId),
                unsupported: !serverSharesPresence(client, userId),
            });
            const { next, holding: held } = withOfflineGrace(fresh, shownRef.current.get(userId), now);
            shownRef.current.set(userId, next);
            anyHeld ||= held;
            result.set(userId, next.vm);
        }

        return { result, anyHeld };
    }, [client, enabled, normalizedIdsKey, normalizedUserIds, revision]);

    // While an old state is held, look again once the grace has passed (offline for real, or back already).
    useEffect(() => {
        if (!output.anyHeld) return undefined;
        const timer = window.setTimeout(() => setRevision((value) => value + 1), OFFLINE_GRACE_MS);
        return () => window.clearTimeout(timer);
    }, [output]);

    return output.result;
}

export function usePresenceVm(
    client: MatrixClient | null,
    userId: string | null | undefined,
    enabled: boolean,
): PresenceVm | null {
    const normalizedUserId = typeof userId === "string" && userId.length > 0 ? userId : null;
    const map = usePresenceMap(client, normalizedUserId ? [normalizedUserId] : [], enabled);
    if (!normalizedUserId) {
        return null;
    }

    return map.get(normalizedUserId) ?? null;
}

