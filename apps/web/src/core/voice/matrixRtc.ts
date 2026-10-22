import { BaseKeyProvider, createKeyMaterialFromBuffer } from "livekit-client";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";
import {
    isLivekitTransportConfig,
    type CallMembership,
    type LivekitTransport,
    type LivekitTransportConfig,
    type MatrixRTCSession,
} from "matrix-js-sdk/src/matrixrtc";

import type { CoreConfig } from "../config/configTypes";
import type { VoiceParticipantsResponse } from "./voiceService";

// MatrixRTC (MSC4143) voice backend, interoperable with Element Call.
// The heorot-voice-relay token flow in voiceService.ts remains the fallback when no LiveKit transport is advertised.

const RTC_FOCI_WELL_KNOWN_KEY = "org.matrix.msc4143.rtc_foci";
const DISCOVERY_FAILURE_CACHE_MS = 60_000;

export interface SfuCredentials {
    url: string;
    jwt: string;
}

function isAllowedServiceUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol === "https:") {
            return true;
        }
        return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    } catch {
        return false;
    }
}

function pickLiveKitTransport(candidates: unknown): LivekitTransportConfig | null {
    if (!Array.isArray(candidates)) {
        return null;
    }
    for (const candidate of candidates) {
        if (isLivekitTransportConfig(candidate) && isAllowedServiceUrl(candidate.livekit_service_url)) {
            return { type: "livekit", livekit_service_url: candidate.livekit_service_url.replace(/\/+$/, "") };
        }
    }
    return null;
}

async function doDiscoverLiveKitTransport(
    client: MatrixClient,
    config: CoreConfig | null,
): Promise<LivekitTransportConfig | null> {
    try {
        const fromServer = pickLiveKitTransport(await client._unstable_getRTCTransports());
        if (fromServer) return fromServer;
    } catch {
        // Homeserver does not implement the MSC4143 transports endpoint; fall through to .well-known.
    }

    const wellKnown = client.getClientWellKnown?.() as Record<string, unknown> | undefined;
    const fromWellKnown = pickLiveKitTransport(wellKnown?.[RTC_FOCI_WELL_KNOWN_KEY]);
    if (fromWellKnown) return fromWellKnown;

    const configWellKnown = config?.default_server_config as Record<string, unknown> | undefined;
    const fromConfigWellKnown = pickLiveKitTransport(configWellKnown?.[RTC_FOCI_WELL_KNOWN_KEY]);
    if (fromConfigWellKnown) return fromConfigWellKnown;

    const configured = typeof config?.livekit_service_url === "string" ? config.livekit_service_url.trim() : "";
    if (configured) {
        return pickLiveKitTransport([{ type: "livekit", livekit_service_url: configured }]);
    }
    return null;
}

const discoveryCache = new WeakMap<MatrixClient, { promise: Promise<LivekitTransportConfig | null>; at: number }>();

// Returns the LiveKit transport for MatrixRTC, or null when voice should use the heorot-voice-relay fallback.
export function discoverLiveKitTransport(
    client: MatrixClient,
    config: CoreConfig | null,
): Promise<LivekitTransportConfig | null> {
    const cached = discoveryCache.get(client);
    if (cached) {
        return cached.promise.then((transport) => {
            if (transport || Date.now() - cached.at < DISCOVERY_FAILURE_CACHE_MS) {
                return transport;
            }
            discoveryCache.delete(client);
            return discoverLiveKitTransport(client, config);
        });
    }
    const promise = doDiscoverLiveKitTransport(client, config);
    discoveryCache.set(client, { promise, at: Date.now() });
    return promise;
}

export function clearLiveKitTransportCache(client: MatrixClient): void {
    discoveryCache.delete(client);
}

export function toLivekitTransport(transport: LivekitTransportConfig, roomId: string): LivekitTransport {
    return { ...transport, livekit_alias: roomId };
}

// Sends the same membership Element Call does in its default (Compatibility) mode: a session state event naming
// our transport, with the @user:server:DEVICE identity that /sfu/get assigns.
export function joinMatrixRtcSession(
    client: MatrixClient,
    session: MatrixRTCSession,
    transport: LivekitTransportConfig,
    roomId: string,
    options: { manageMediaKeys: boolean },
): void {
    const userId = client.getSafeUserId();
    const deviceId = client.getDeviceId() ?? "";
    session.joinRTCSession({ userId, deviceId, memberId: `${userId}:${deviceId}` }, [], toLivekitTransport(transport, roomId), {
        callIntent: "audio",
        manageMediaKeys: options.manageMediaKeys,
        // Required: current Element Call only exchanges media keys over to-device messages.
        useExperimentalToDeviceTransport: true,
    });
    session.reemitEncryptionKeys();
}

export async function fetchSfuCredentials(
    client: MatrixClient,
    transport: LivekitTransportConfig,
    roomId: string,
    options?: { signal?: AbortSignal },
): Promise<SfuCredentials> {
    const openIdToken = await client.getOpenIdToken();
    const response = await fetch(`${transport.livekit_service_url}/sfu/get`, {
        method: "POST",
        signal: options?.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            room: roomId,
            openid_token: openIdToken,
            device_id: client.getDeviceId(),
        }),
    });

    if (!response.ok) {
        const error = new Error(`Unable to fetch LiveKit token: HTTP ${response.status}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }

    const body = (await response.json()) as Partial<SfuCredentials>;
    if (typeof body.url !== "string" || typeof body.jwt !== "string") {
        throw new Error("Unable to fetch LiveKit token: malformed response from LiveKit service.");
    }
    return { url: body.url, jwt: body.jwt };
}

// Same parameters as Element Call's MatrixKeyProvider so encrypted media decrypts on both sides.
export class MatrixRtcKeyProvider extends BaseKeyProvider {
    public constructor() {
        super({ ratchetWindowSize: 10, keyringSize: 256 });
    }

    public async setRawKey(key: Uint8Array<ArrayBuffer>, rtcBackendIdentity: string, index: number): Promise<void> {
        // Copy out exactly the key bytes: the Uint8Array may be a view into a larger buffer.
        const keyBytes = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
        const cryptoKey = await createKeyMaterialFromBuffer(keyBytes);
        this.onSetEncryptionKey(cryptoKey, rtcBackendIdentity, index);
    }
}

// Parses a LiveKit participant identity into a Matrix user ID. Handles:
// - MatrixRTC session memberships: "@user:server:DEVICEID"
// - heorot-voice-relay: "@user:server" or "@user:server::suffix"
// Hashed identities used by sticky (m.rtc.member) memberships cannot be parsed; resolve those via memberships.
export function parseMatrixUserIdFromIdentity(identity: string): string | undefined {
    if (!identity.startsWith("@")) {
        return undefined;
    }
    const relaySeparatorIndex = identity.indexOf("::");
    if (relaySeparatorIndex > 0) {
        const candidate = identity.slice(0, relaySeparatorIndex);
        return candidate.includes(":") ? candidate : undefined;
    }

    const lastColon = identity.lastIndexOf(":");
    if (lastColon <= 0) {
        return undefined;
    }
    const withoutLastSegment = identity.slice(0, lastColon);
    const lastSegment = identity.slice(lastColon + 1);
    // A numeric last segment is a server port ("@user:host:8448"), not a device ID.
    if (!withoutLastSegment.includes(":") || /^\d+$/.test(lastSegment)) {
        return identity;
    }
    return withoutLastSegment;
}

export function buildRtcIdentityMap(memberships: CallMembership[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const membership of memberships) {
        map.set(membership.rtcBackendIdentity, membership.userId);
    }
    return map;
}

export function getRtcVoiceParticipants(client: MatrixClient, room: Room): VoiceParticipantsResponse {
    const session = client.matrixRTC.getRoomSession(room);
    const seenUserIds = new Set<string>();
    const participants: VoiceParticipantsResponse["participants"] = [];
    for (const membership of session.memberships) {
        if (seenUserIds.has(membership.userId)) {
            continue;
        }
        seenUserIds.add(membership.userId);
        participants.push({ identity: membership.userId, matrixUserId: membership.userId });
    }
    return { matrixRoomId: room.roomId, participants, count: participants.length };
}
