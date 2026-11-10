// SPDX-License-Identifier: AGPL-3.0-only
// Calls across homeservers with more than one call server (MSC4143 multi-SFU, what Element Call does): since
// lk-jwt-service 0.7, a homeserver's call server lets only its own users talk; people from other homeservers may only
// listen there and talk on their own homeserver's call server. So besides the connection we talk on, Meadhall keeps a
// listen-only connection to every other call server the people in the call talk on, and merges who's there.
import {
    Room,
    RoomEvent,
    type Participant,
    type RemoteParticipant,
    type RemoteTrack,
    type RemoteTrackPublication,
} from "livekit-client";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import type { LivekitTransportConfig } from "matrix-js-sdk/src/matrixrtc";

import { fetchSfuCredentials, type MatrixRtcKeyProvider } from "../../adapters/voiceAdapter";
import { createLiveKitE2EEWorker } from "../../voice/e2eeWorker";

export interface ListenerHandlers {
    onTrackSubscribed: (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
    onTrackUnsubscribed: (track: RemoteTrack, publication: RemoteTrackPublication) => void;
    // Who's there, what they publish or who's speaking changed.
    onChange: () => void;
    onError: (serviceUrl: string, error: unknown) => void;
}

interface Listener {
    room: Room;
    worker: Worker | null;
}

// The call servers to listen on: where each other member talks (their own, `transports[0]`) and where the call is
// hosted for them (the oldest membership's), minus the one we talk on.
export function transportsToListenOn(
    memberships: ReadonlyArray<{
        sender?: string;
        deviceId?: string;
        transports?: ReadonlyArray<{ type?: unknown; livekit_service_url?: unknown }>;
        getTransport?: (oldest: never) => { type?: unknown; livekit_service_url?: unknown } | undefined;
    }>,
    own: { userId: string; deviceId: string },
    talkingOnUrl: string,
): LivekitTransportConfig[] {
    const oldest = memberships[0];
    const found = new Map<string, LivekitTransportConfig>();
    const add = (transport: { type?: unknown; livekit_service_url?: unknown } | undefined): void => {
        if (transport?.type !== "livekit" || typeof transport.livekit_service_url !== "string") return;
        const url = transport.livekit_service_url.replace(/\/+$/, "");
        if (url && url !== talkingOnUrl.replace(/\/+$/, "") && !found.has(url)) found.set(url, { type: "livekit", livekit_service_url: url });
    };
    for (const membership of memberships) {
        if (membership.sender === own.userId && membership.deviceId === own.deviceId) continue;
        add(membership.transports?.[0]);
        try {
            add(oldest ? membership.getTransport?.(oldest as never) : undefined);
        } catch {
            // Older membership shapes: their own transport is enough.
        }
    }
    return [...found.values()];
}

export class ListenerRooms {
    private readonly listeners = new Map<string, Listener>();
    private readonly connecting = new Set<string>();
    private closed = false;

    constructor(
        private readonly client: MatrixClient,
        private readonly matrixRoomId: string,
        private readonly keyProvider: MatrixRtcKeyProvider | null,
        private readonly handlers: ListenerHandlers,
    ) {}

    // Connects to the call servers in `transports` that aren't connected yet, and leaves the ones no longer needed.
    sync(transports: LivekitTransportConfig[]): void {
        if (this.closed) return;
        const wanted = new Set(transports.map((transport) => transport.livekit_service_url));
        for (const [url, listener] of this.listeners) {
            if (!wanted.has(url)) {
                this.listeners.delete(url);
                void this.close(listener);
                this.handlers.onChange();
            }
        }
        for (const transport of transports) {
            const url = transport.livekit_service_url;
            if (this.listeners.has(url) || this.connecting.has(url)) continue;
            this.connecting.add(url);
            void this.connect(transport)
                .then((listener) => {
                    if (this.closed || !wanted.has(url)) {
                        void this.close(listener);
                        return;
                    }
                    this.listeners.set(url, listener);
                    this.handlers.onChange();
                })
                .catch((error) => this.handlers.onError(url, error))
                .finally(() => this.connecting.delete(url));
        }
    }

    private async connect(transport: LivekitTransportConfig): Promise<Listener> {
        const credentials = await fetchSfuCredentials(this.client, transport, this.matrixRoomId);
        const worker = this.keyProvider ? await createLiveKitE2EEWorker() : null;
        const room = new Room({
            adaptiveStream: true,
            ...(this.keyProvider && worker ? { e2ee: { keyProvider: this.keyProvider, worker } } : {}),
        });
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
            this.handlers.onTrackSubscribed(track, publication, participant);
            this.handlers.onChange();
        })
            .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
                this.handlers.onTrackUnsubscribed(track, publication);
                this.handlers.onChange();
            })
            .on(RoomEvent.ParticipantConnected, () => this.handlers.onChange())
            .on(RoomEvent.ParticipantDisconnected, () => this.handlers.onChange())
            .on(RoomEvent.TrackPublished, () => this.handlers.onChange())
            .on(RoomEvent.TrackUnpublished, () => this.handlers.onChange())
            .on(RoomEvent.ActiveSpeakersChanged, () => this.handlers.onChange());
        try {
            await room.connect(credentials.url, credentials.jwt, { autoSubscribe: true });
            if (this.keyProvider) await room.setE2EEEnabled(true);
            await room.startAudio().catch(() => undefined);
        } catch (error) {
            worker?.terminate();
            throw error;
        }
        return { room, worker };
    }

    private async close(listener: Listener): Promise<void> {
        await listener.room.disconnect().catch(() => undefined);
        listener.worker?.terminate();
    }

    // Everyone talking on the other call servers (not us: we only listen there).
    remoteParticipants(): RemoteParticipant[] {
        return [...this.listeners.values()].flatMap((listener) => [...listener.room.remoteParticipants.values()]);
    }

    activeSpeakers(): Participant[] {
        return [...this.listeners.values()].flatMap((listener) => listener.room.activeSpeakers);
    }

    get count(): number {
        return this.listeners.size;
    }

    closeAll(): void {
        this.closed = true;
        for (const listener of this.listeners.values()) void this.close(listener);
        this.listeners.clear();
    }
}
