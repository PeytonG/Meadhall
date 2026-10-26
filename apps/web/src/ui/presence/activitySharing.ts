// SPDX-License-Identifier: AGPL-3.0-only
// What you're doing ("Playing ...", "Listening to ..."), and who gets to see it. Settings → Privacy → Activity.
//
// Who can see it, honestly:
// - everyone: in your profile (anyone who looks you up can read it) and your status text.
// - contacts: only your status text, which the homeserver shows only to people you share a chat or server with.
// - dms: sent end-to-end encrypted, straight to the devices of people you have a DM with; nobody else (not even
//   the server) sees it. They only see it while it's fresh (it's re-sent every few minutes).
// - nobody: only you see it, in Settings.
import { useSyncExternalStore } from "react";
import { ClientEvent, type MatrixClient, type ReceivedToDeviceMessage } from "matrix-js-sdk/src/matrix";

import { getDirectRoomIds } from "../adapters/dmAdapter";
import type { PublishedActivity } from "./clientStatus";

export type ActivityAudience = "everyone" | "contacts" | "dms" | "nobody";
export type ActivityKind = "playing" | "listening" | "watching" | "competing";

export interface DetectedActivity {
    source: "rpc" | "steam" | "game" | "media";
    kind: ActivityKind;
    name: string;
    details?: string;
    state?: string;
    appId?: string;
    startedAt?: number;
}

export interface ActivitySettings {
    // Sources (desktop app): the game Steam runs, apps that use Discord Rich Presence, games recognised from
    // the process list, and music/video playing on Linux (MPRIS).
    steam: boolean;
    richPresence: boolean;
    games: boolean;
    media: boolean;
    showDetails: boolean;
    audience: ActivityAudience;
    // Names never shared (matched without case; also the app's id).
    hidden: string[];
}

export const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = {
    steam: true,
    richPresence: false,
    games: false,
    media: false,
    showDetails: false,
    audience: "contacts",
    hidden: [],
};

export function normalizeActivitySettings(value: unknown): ActivitySettings {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const audiences: ActivityAudience[] = ["everyone", "contacts", "dms", "nobody"];
    return {
        steam: record.steam !== false,
        richPresence: record.richPresence === true,
        games: record.games === true,
        media: record.media === true,
        showDetails: record.showDetails === true,
        audience: audiences.includes(record.audience as ActivityAudience) ? (record.audience as ActivityAudience) : "contacts",
        hidden: Array.isArray(record.hidden)
            ? [...new Set(record.hidden.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))].slice(0, 200)
            : [],
    };
}

export const ACTIVITY_VERBS: Record<ActivityKind, string> = {
    playing: "Playing",
    listening: "Listening to",
    watching: "Watching",
    competing: "Competing in",
};

export function isHidden(activity: Pick<DetectedActivity, "name" | "appId">, hidden: string[]): boolean {
    const name = activity.name.toLowerCase();
    return hidden.some((entry) => {
        const wanted = entry.toLowerCase();
        return wanted === name || (activity.appId !== undefined && wanted === activity.appId.toLowerCase());
    });
}

// The one activity to share: the first that isn't hidden. `since` stays put while it's the same thing.
export function pickActivity(detected: DetectedActivity[], settings: ActivitySettings, previous: PublishedActivity | null, now = Date.now()): PublishedActivity | null {
    const chosen = detected.find((activity) => !isHidden(activity, settings.hidden));
    if (!chosen) return null;
    const details = settings.showDetails ? [chosen.details, chosen.state].filter(Boolean).join(" · ").slice(0, 128) || undefined : undefined;
    const same = previous && previous.name === chosen.name && (previous.kind ?? "playing") === chosen.kind;
    return {
        name: chosen.name.slice(0, 128),
        kind: chosen.kind,
        since: same ? previous.since : (chosen.startedAt ?? now),
        ...(details ? { details } : {}),
    };
}

export function activityText(activity: PublishedActivity): string {
    const verb = ACTIVITY_VERBS[activity.kind ?? "playing"] ?? "Playing";
    return activity.details ? `${verb} ${activity.name} · ${activity.details}` : `${verb} ${activity.name}`;
}

// What the desktop app found most recently, for Settings to show (and offer "Hide this").
let detectedNow: DetectedActivity[] = [];
const detectedListeners = new Set<() => void>();

export function setDetectedActivities(list: DetectedActivity[]): void {
    if (JSON.stringify(list) === JSON.stringify(detectedNow)) return;
    detectedNow = list;
    for (const listener of detectedListeners) listener();
}

export function useDetectedActivities(): DetectedActivity[] {
    return useSyncExternalStore(
        (listener) => {
            detectedListeners.add(listener);
            return () => detectedListeners.delete(listener);
        },
        () => detectedNow,
    );
}

// --- Sharing with DM partners only (encrypted to-device messages) ---

export const ACTIVITY_TO_DEVICE_TYPE = "io.github.peytong.meadhall.activity";
const PRIVATE_TTL_MS = 10 * 60_000;
const RESEND_MS = 4 * 60_000;
const MAX_RECIPIENTS = 50;

// People you have a DM with. Sending needs an encrypted DM: encryption keys are only kept for people you share
// an encrypted room with (Meadhall's DMs are encrypted).
function dmPartners(client: MatrixClient, encryptedOnly = false): string[] {
    const ownUserId = client.getUserId();
    const partners = new Set<string>();
    for (const roomId of getDirectRoomIds(client)) {
        const room = client.getRoom(roomId);
        if (!room || room.getMyMembership() !== "join") continue;
        if (encryptedOnly && !room.hasEncryptionStateEvent()) continue;
        for (const member of room.getMembers()) {
            if (member.userId !== ownUserId && (member.membership === "join" || member.membership === "invite")) partners.add(member.userId);
        }
    }
    return [...partners].slice(0, MAX_RECIPIENTS);
}

let lastSent = "";
let lastSentAt = 0;

export async function shareActivityWithDms(client: MatrixClient, activity: PublishedActivity | null, force = false): Promise<void> {
    const crypto = client.getCrypto();
    if (!crypto) return;
    const payload = { activity, expires_in: PRIVATE_TTL_MS };
    const key = JSON.stringify(activity);
    if (!force && key === lastSent && Date.now() - lastSentAt < RESEND_MS) return;
    // Nothing to say and nothing said before: stay quiet.
    if (!activity && lastSent === "") return;
    const userIds = dmPartners(client, true);
    if (!userIds.length) return;
    const deviceMap = await crypto.getUserDeviceInfo(userIds, true);
    const devices: Array<{ userId: string; deviceId: string }> = [];
    for (const [userId, userDevices] of deviceMap) {
        for (const deviceId of userDevices.keys()) devices.push({ userId, deviceId });
    }
    if (!devices.length) return;
    const batch = await crypto.encryptToDeviceMessages(ACTIVITY_TO_DEVICE_TYPE, devices, payload);
    await client.queueToDevice(batch);
    lastSent = activity ? key : "";
    lastSentAt = Date.now();
}

export function resendIntervalMs(): number {
    return RESEND_MS;
}

const privateActivities = new Map<string, { activity: PublishedActivity; expiresAt: number }>();
const privateListeners = new Set<() => void>();

export function onPrivateActivityChange(listener: () => void): () => void {
    privateListeners.add(listener);
    return () => privateListeners.delete(listener);
}

export function privateActivityFor(userId: string, now = Date.now()): PublishedActivity | null {
    const entry = privateActivities.get(userId);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
        privateActivities.delete(userId);
        return null;
    }
    return entry.activity;
}

export function parseSharedActivity(value: unknown): PublishedActivity | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim()) return null;
    const kinds = Object.keys(ACTIVITY_VERBS);
    return {
        name: record.name.trim().slice(0, 128),
        since: typeof record.since === "number" && Number.isFinite(record.since) ? record.since : 0,
        kind: kinds.includes(record.kind as string) ? (record.kind as ActivityKind) : "playing",
        ...(typeof record.details === "string" && record.details.trim() ? { details: record.details.trim().slice(0, 128) } : {}),
    };
}

// Accepts only messages that arrived encrypted, from people you have a DM with.
export function receivePrivateActivity(client: MatrixClient, received: ReceivedToDeviceMessage, now = Date.now()): boolean {
    const { message, encryptionInfo } = received;
    if (message.type !== ACTIVITY_TO_DEVICE_TYPE || !encryptionInfo) return false;
    const sender = message.sender;
    if (!sender || encryptionInfo.sender !== sender || !dmPartners(client).includes(sender)) return false;
    const content = (message.content ?? {}) as { activity?: unknown; expires_in?: unknown };
    const activity = parseSharedActivity(content.activity);
    const ttl = typeof content.expires_in === "number" ? Math.min(Math.max(content.expires_in, 0), PRIVATE_TTL_MS) : PRIVATE_TTL_MS;
    if (activity) privateActivities.set(sender, { activity, expiresAt: now + ttl });
    else privateActivities.delete(sender);
    for (const listener of privateListeners) listener();
    return true;
}

export function listenForPrivateActivity(client: MatrixClient): () => void {
    const onToDevice = (received: ReceivedToDeviceMessage): void => {
        receivePrivateActivity(client, received);
    };
    client.on(ClientEvent.ReceivedToDeviceMessage, onToDevice);
    return () => {
        client.off(ClientEvent.ReceivedToDeviceMessage, onToDevice);
    };
}
