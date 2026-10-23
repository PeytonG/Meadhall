// SPDX-License-Identifier: AGPL-3.0-only
// Status beyond plain Matrix presence, like Discord's.
//
// - Online / Idle / Invisible and the custom status text use real Matrix presence (live over /sync, and Element
//   shows them too): online, unavailable, offline, and status_msg.
// - Synapse rejects the "busy" presence, so Do Not Disturb (and "on mobile") travel in an extended-profile field
//   that Meadhall reads: DND people appear Idle in other apps and DND in Meadhall.
// - People on the Android/iOS app who haven't picked a status show a green phone instead of the online dot.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { isAndroidApp } from "../../core/platform/android";

export const STATUS_PROFILE_KEY = "io.github.peytong.meadhall.status";
const LOCAL_KEY = "heorot.own_status.v1";
const CACHE_MS = 5 * 60_000;

export type ChosenStatus = "auto" | "online" | "idle" | "dnd" | "invisible";

export interface OwnStatus {
    state: ChosenStatus;
    text: string;
}

export interface PublishedStatus {
    // Only manual choices that should be visible (invisible is never published).
    state: "online" | "idle" | "dnd" | null;
    platform: "mobile" | "desktop" | "web";
    // What they're playing (desktop app, from Steam), shown as "Playing ...". Never published while invisible.
    activity?: PublishedActivity | null;
}

export interface PublishedActivity {
    name: string;
    since: number;
}

export const DEFAULT_OWN_STATUS: OwnStatus = { state: "auto", text: "" };

export function currentPlatform(): PublishedStatus["platform"] {
    if (typeof window === "undefined") return "web";
    const platform = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    if (isAndroidApp() || platform === "ios") return "mobile";
    return window.heorotDesktop ? "desktop" : "web";
}

export function loadOwnStatus(): OwnStatus {
    try {
        const raw = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "null") as Partial<OwnStatus> | null;
        const states: ChosenStatus[] = ["auto", "online", "idle", "dnd", "invisible"];
        return {
            state: raw && states.includes(raw.state as ChosenStatus) ? (raw.state as ChosenStatus) : "auto",
            text: typeof raw?.text === "string" ? raw.text.slice(0, 128) : "",
        };
    } catch {
        return DEFAULT_OWN_STATUS;
    }
}

export function matrixPresenceFor(state: ChosenStatus): "online" | "unavailable" | "offline" {
    return state === "idle" || state === "dnd" ? "unavailable" : state === "invisible" ? "offline" : "online";
}

export function publishedStatusFor(own: OwnStatus, platform = currentPlatform(), activity: PublishedActivity | null = null): PublishedStatus {
    const manual = own.state === "online" || own.state === "idle" || own.state === "dnd" ? own.state : null;
    return { state: manual, platform, activity: own.state === "invisible" ? null : activity };
}

let lastPublished = "";

// Synapse rate-limits presence updates hard (about one every few seconds), so writes are serialized: only the newest
// wanted value is sent, and a 429 waits out the server's retry-after before trying again.
type PresenceBody = { presence: "online" | "unavailable" | "offline"; status_msg: string };
let wantedPresence: PresenceBody | null = null;
let sentPresence = "";
let presenceLoop: Promise<void> | null = null;

function sendPresence(client: MatrixClient, body: PresenceBody): Promise<void> {
    wantedPresence = body;
    presenceLoop ??= (async () => {
        for (let attempt = 0; wantedPresence && attempt < 10; attempt += 1) {
            const next = wantedPresence;
            if (JSON.stringify(next) === sentPresence) break;
            try {
                await client.setPresence(next);
                sentPresence = JSON.stringify(next);
            } catch (error) {
                const retryAfter = (error as { getRetryAfterMs?: () => number | null }).getRetryAfterMs?.();
                if (retryAfter === undefined) break; // not a rate limit; try again on the next change
                await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter ?? 2_000, 30_000)));
            }
        }
        presenceLoop = null;
    })();
    return presenceLoop;
}

// Applies your status everywhere: presence (and what /sync reports), status text, and the profile field.
// `away` is automatic Away (no input for a while); it only affects the Automatic status and isn't saved.
export async function applyOwnStatus(client: MatrixClient, own: OwnStatus, away = false, activity: PublishedActivity | null = null): Promise<void> {
    try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(own));
    } catch {
        // Remembered for this session only.
    }
    const presence = matrixPresenceFor(own.state === "auto" && away ? "idle" : own.state);
    client.setSyncPresence(presence as never);
    const published = publishedStatusFor(own, currentPlatform(), activity);
    cache.set(client.getSafeUserId(), { status: published, fetchedAt: Date.now() });
    notify();
    // Independent: presence can be waiting out a rate limit, which mustn't hold up the profile field.
    await Promise.all([sendPresence(client, { presence, status_msg: own.text.trim() }), publishStatus(client, published)]);
}

// Profile writes are serialized too: two quick changes could otherwise land out of order and leave the older one
// on the server while we believe the newer one was saved.
let wantedPublished: string | null = null;
let publishLoop: Promise<void> | null = null;

function publishStatus(client: MatrixClient, published: PublishedStatus): Promise<void> {
    wantedPublished = JSON.stringify(published);
    publishLoop ??= (async () => {
        for (let attempt = 0; wantedPublished !== null && wantedPublished !== lastPublished && attempt < 5; attempt += 1) {
            const next = wantedPublished;
            try {
                await client.setExtendedProfileProperty(STATUS_PROFILE_KEY, JSON.parse(next) as PublishedStatus);
                lastPublished = next;
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 2_000));
            }
        }
        publishLoop = null;
    })();
    return publishLoop;
}

// Others' published status, cached; refreshed when their presence changes (see usePresenceMap).
const cache = new Map<string, { status: PublishedStatus | null; fetchedAt: number }>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) listener();
}

export function onPublishedStatusChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function parsePublishedStatus(value: unknown): PublishedStatus | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const state = record.state === "online" || record.state === "idle" || record.state === "dnd" ? record.state : null;
    const platform = record.platform === "mobile" || record.platform === "desktop" ? record.platform : "web";
    const activityRecord = record.activity && typeof record.activity === "object" ? (record.activity as Record<string, unknown>) : null;
    const activity =
        activityRecord && typeof activityRecord.name === "string" && activityRecord.name.trim()
            ? { name: activityRecord.name.trim().slice(0, 128), since: typeof activityRecord.since === "number" ? activityRecord.since : 0 }
            : null;
    return { state, platform, activity };
}

export function cachedPublishedStatus(userId: string): PublishedStatus | null {
    return cache.get(userId)?.status ?? null;
}

export function refreshPublishedStatus(client: MatrixClient, userId: string, force = false): void {
    const cached = cache.get(userId);
    if ((!force && cached && Date.now() - cached.fetchedAt < CACHE_MS) || inFlight.has(userId)) {
        return;
    }
    inFlight.add(userId);
    void client
        .getExtendedProfileProperty(userId, STATUS_PROFILE_KEY)
        .then((value) => parsePublishedStatus(value))
        .catch(() => null)
        .then((status) => {
            inFlight.delete(userId);
            const before = JSON.stringify(cache.get(userId)?.status ?? null);
            cache.set(userId, { status, fetchedAt: Date.now() });
            if (JSON.stringify(status) !== before) notify();
        });
}

// Do Not Disturb: no notification pop-ups or sounds, and incoming calls don't ring (the card still shows).
export function isDoNotDisturb(): boolean {
    try {
        return loadOwnStatus().state === "dnd";
    } catch {
        return false;
    }
}
