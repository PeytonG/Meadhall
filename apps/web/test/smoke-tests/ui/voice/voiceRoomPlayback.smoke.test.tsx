import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioSettings } from "../../../../src/ui/settings/user/settingsStore";

type VoiceRoomComponent = typeof import("../../../../src/ui/components/voice/VoiceRoom").VoiceRoom;
type VoiceRoomHandle = import("../../../../src/ui/components/voice/VoiceRoom").VoiceRoomHandle;

interface FakeTrack {
    kind: string;
    sid: string;
    attach: () => HTMLAudioElement;
    detach: (element?: HTMLAudioElement) => HTMLAudioElement[];
}

interface FakePublication {
    kind: string;
    source: string;
    isSubscribed: boolean;
    trackSid: string;
    track: FakeTrack;
    setSubscribed: ReturnType<typeof vi.fn>;
}

function createAudioSettings(): AudioSettings {
    return {
        preferredAudioInputId: "default",
        preferredAudioOutputId: "default",
        micTestLoopbackEnabled: false,
        autoGainControlEnabled: true,
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        voiceIsolationEnabled: true,
        micProfile: "speech",
    };
}

function createAudioTrack(trackSid: string): FakeTrack {
    return {
        kind: "audio",
        sid: trackSid,
        attach: () => {
            const element = document.createElement("audio");
            return element;
        },
        detach: (element?: HTMLAudioElement) => (element ? [element] : []),
    };
}

interface FakeRtcSession {
    memberships: Array<{ rtcBackendIdentity: string; userId: string }>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    listenerCount: () => number;
    joinRTCSession: ReturnType<typeof vi.fn>;
    isJoined: ReturnType<typeof vi.fn>;
    leaveRoomSession: ReturnType<typeof vi.fn>;
    reemitEncryptionKeys: ReturnType<typeof vi.fn>;
}

function createRtcSession(memberships: FakeRtcSession["memberships"] = []): FakeRtcSession {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    let joined = false;
    return {
        memberships,
        on: (event, handler) => {
            const set = handlers.get(event) ?? new Set();
            set.add(handler);
            handlers.set(event, set);
        },
        off: (event, handler) => {
            handlers.get(event)?.delete(handler);
        },
        emit: (event, ...args) => {
            for (const handler of handlers.get(event) ?? []) {
                handler(...args);
            }
        },
        listenerCount: () => [...handlers.values()].reduce((total, set) => total + set.size, 0),
        joinRTCSession: vi.fn(() => {
            joined = true;
        }),
        isJoined: vi.fn(() => joined),
        leaveRoomSession: vi.fn(async () => {
            joined = false;
            return true;
        }),
        reemitEncryptionKeys: vi.fn(),
    };
}

function createAudioPublication(trackSid: string): FakePublication {
    const publication = {
        kind: "audio",
        source: "microphone",
        isSubscribed: false,
        trackSid,
        track: createAudioTrack(trackSid),
        setSubscribed: vi.fn(),
    } as FakePublication;

    publication.setSubscribed = vi.fn((value: boolean) => {
        publication.isSubscribed = value;
    });

    return publication;
}

describe("voice room smoke", () => {
    let container: HTMLDivElement;
    let root: Root;
    let VoiceRoom: VoiceRoomComponent;
    let RoomEvent: Record<string, string>;

    let createdRooms: Array<{
        emit: (event: string, ...args: unknown[]) => void;
        options: Record<string, unknown>;
        connectArgs: unknown[];
        setE2EEEnabled: ReturnType<typeof vi.fn>;
        switchActiveDevice: ReturnType<typeof vi.fn>;
        localParticipant: { setMicrophoneEnabled: ReturnType<typeof vi.fn> };
    }>;
    let seededRemotePublications: Array<{
        participantIdentity: string;
        participantSid: string;
        publication: FakePublication | null;
    }>;
    let playAttempts: string[];
    let keyProviderKeys: Array<{ key: unknown; identity?: string; index?: number }>;
    let voiceAdapterMocks: {
        fetchLiveKitToken: ReturnType<typeof vi.fn>;
        discoverLiveKitTransport: ReturnType<typeof vi.fn>;
        fetchSfuCredentials: ReturnType<typeof vi.fn>;
        updateVoiceParticipantState: ReturnType<typeof vi.fn>;
    };
    let createdWorkers: Array<{ terminate: ReturnType<typeof vi.fn> }>;
    let micRestarts: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);

        createdRooms = [];
        seededRemotePublications = [];
        playAttempts = [];
        keyProviderKeys = [];
        createdWorkers = [];
        micRestarts = vi.fn(async () => undefined);
        // jsdom has no setSinkId; the app only offers speaker switching where it exists.
        Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", { configurable: true, value: vi.fn(async () => undefined) });
        voiceAdapterMocks = {
            fetchLiveKitToken: vi.fn(async () => ({
                token: "token",
                wsUrl: "wss://livekit.example/ws",
                livekitRoom: "voice-room",
                expiresAt: "2026-01-01T00:00:00.000Z",
            })),
            discoverLiveKitTransport: vi.fn(async () => null),
            fetchSfuCredentials: vi.fn(async () => ({ url: "wss://sfu.example.org", jwt: "sfu-jwt" })),
            updateVoiceParticipantState: vi.fn(async () => undefined),
        };

        Object.defineProperty(HTMLMediaElement.prototype, "play", {
            configurable: true,
            value: vi.fn(function play(this: HTMLMediaElement) {
                playAttempts.push(this.dataset.lkTrackSid ?? "unknown");
                return Promise.resolve();
            }),
        });

        vi.doMock("livekit-client", () => {
            const ConnectionState = {
                Disconnected: "disconnected",
                Connecting: "connecting",
                Connected: "connected",
                Reconnecting: "reconnecting",
            };

            const RoomEvent = {
                ConnectionStateChanged: "ConnectionStateChanged",
                ActiveSpeakersChanged: "ActiveSpeakersChanged",
                ParticipantConnected: "ParticipantConnected",
                ParticipantDisconnected: "ParticipantDisconnected",
                TrackPublished: "TrackPublished",
                TrackSubscribed: "TrackSubscribed",
                TrackUnsubscribed: "TrackUnsubscribed",
                TrackSubscriptionFailed: "TrackSubscriptionFailed",
                LocalAudioSilenceDetected: "LocalAudioSilenceDetected",
                LocalTrackPublished: "LocalTrackPublished",
                LocalTrackUnpublished: "LocalTrackUnpublished",
                Disconnected: "Disconnected",
                MediaDevicesChanged: "MediaDevicesChanged",
                MediaDevicesError: "MediaDevicesError",
                AudioPlaybackStatusChanged: "AudioPlaybackStatusChanged",
            };

            const Track = {
                Kind: {
                    Audio: "audio",
                    Video: "video",
                },
                Source: {
                    Microphone: "microphone",
                    ScreenShare: "screen_share",
                    ScreenShareAudio: "screen_share_audio",
                },
            };

            class Room {
                public static async getLocalDevices(): Promise<MediaDeviceInfo[]> {
                    return [];
                }

                public readonly remoteParticipants = new Map<string, any>();
                public readonly localParticipant: any;
                public activeSpeakers: unknown[] = [];
                public canPlaybackAudio = true;
                public state = ConnectionState.Disconnected;
                public connectArgs: unknown[] = [];
                public readonly setE2EEEnabled = vi.fn(async () => undefined);

                private readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();

                public constructor(public readonly options: Record<string, unknown> = {}) {
                    this.localParticipant = {
                        identity: "@self:example.org::local",
                        sid: "local-sid",
                        isSpeaking: false,
                        audioLevel: 0,
                        trackPublications: new Map<string, any>(),
                        getTrackPublication: (source: string) => this.localParticipant.trackPublications.get(source),
                        setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
                            if (!enabled) {
                                this.localParticipant.trackPublications.delete(Track.Source.Microphone);
                                return;
                            }
                            this.localParticipant.trackPublications.set(Track.Source.Microphone, {
                                kind: Track.Kind.Audio,
                                source: Track.Source.Microphone,
                                track: {
                                    restartTrack: micRestarts,
                                    mediaStreamTrack: {
                                        getSettings: () => ({
                                            echoCancellation: true,
                                            noiseSuppression: true,
                                            autoGainControl: true,
                                            voiceIsolation: true,
                                        }),
                                    },
                                },
                            });
                        }),
                        setScreenShareEnabled: async () => undefined,
                    };

                    for (const seed of seededRemotePublications) {
                        const participant = {
                            identity: seed.participantIdentity,
                            sid: seed.participantSid,
                            isSpeaking: false,
                            audioLevel: 0,
                            trackPublications: new Map<string, FakePublication>(
                                seed.publication ? [[seed.publication.trackSid, seed.publication]] : [],
                            ),
                            getTrackPublication: (source: string) => {
                                for (const publication of participant.trackPublications.values()) {
                                    if (publication.source === source) {
                                        return publication;
                                    }
                                }
                                return undefined;
                            },
                        };
                        this.remoteParticipants.set(seed.participantSid, participant);
                    }

                    createdRooms.push(this);
                }

                public on(event: string, handler: (...args: unknown[]) => void): this {
                    const set = this.handlers.get(event) ?? new Set();
                    set.add(handler);
                    this.handlers.set(event, set);
                    return this;
                }

                public emit(event: string, ...args: unknown[]): void {
                    const handlers = this.handlers.get(event);
                    if (!handlers) {
                        return;
                    }
                    for (const handler of handlers) {
                        handler(...args);
                    }
                }

                public async connect(...args: unknown[]): Promise<void> {
                    this.connectArgs = args;
                    this.state = ConnectionState.Connected;
                    this.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);
                }

                public async startAudio(): Promise<void> {
                    this.canPlaybackAudio = true;
                }

                public readonly switchActiveDevice = vi.fn(async (_kind: string, _deviceId: string) => true);

                public async disconnect(): Promise<void> {
                    this.state = ConnectionState.Disconnected;
                    this.emit(RoomEvent.Disconnected);
                }
            }

            class BaseKeyProvider {
                public constructor(public readonly keyProviderOptions: Record<string, unknown> = {}) {}

                protected onSetEncryptionKey(key: unknown, identity?: string, index?: number): void {
                    keyProviderKeys.push({ key, identity, index });
                }
            }

            return {
                Room,
                RoomEvent,
                ConnectionState,
                Track,
                BaseKeyProvider,
                createKeyMaterialFromBuffer: async (buffer: ArrayBuffer) => ({ importedBytes: new Uint8Array(buffer) }),
                AudioPresets: {
                    speech: "speech",
                    music: "music",
                },
                VideoPresets: {
                    h720: { resolution: { width: 1280, height: 720 } },
                    h1080: { resolution: { width: 1920, height: 1080 } },
                    h1440: { resolution: { width: 2560, height: 1440 } },
                },
            };
        });

        // Real identity/key helpers; only the network calls are faked.
        vi.doMock("../../../../src/ui/adapters/voiceAdapter", async () => ({
            ...(await vi.importActual<typeof import("../../../../src/ui/adapters/voiceAdapter")>(
                "../../../../src/ui/adapters/voiceAdapter",
            )),
            ...voiceAdapterMocks,
        }));

        vi.doMock("../../../../src/ui/voice/e2eeWorker", () => ({
            createLiveKitE2EEWorker: vi.fn(async () => {
                const worker = { terminate: vi.fn() };
                createdWorkers.push(worker);
                return worker;
            }),
        }));

        vi.doMock("../../../../src/ui/providers/MatrixProvider", () => ({
            useMatrix: () => ({ config: null }),
        }));

        vi.doMock("../../../../src/ui/notifications/sound", () => ({
            playVoiceJoinSound: vi.fn(async () => undefined),
            playVoiceLeaveSound: vi.fn(async () => undefined),
            playParticipantJoinSound: vi.fn(async () => undefined),
            playParticipantLeaveSound: vi.fn(async () => undefined),
            playScreenShareStartSound: vi.fn(async () => undefined),
            playScreenShareStopSound: vi.fn(async () => undefined),
        }));

        vi.doMock("../../../../src/ui/components/Avatar", () => ({
            Avatar: ({ name, src }: { name?: string; src?: string | null }) =>
                React.createElement("div", { "data-avatar": "1", "data-src": src ?? "" }, name ?? ""),
        }));

        vi.doMock("../../../../src/ui/components/rooms/RoomDialog", () => ({
            RoomDialog: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children ?? null),
        }));

        ({ VoiceRoom } = await import("../../../../src/ui/components/voice/VoiceRoom"));
        ({ RoomEvent } = await import("livekit-client"));
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
    });

    it("subscribes and plays late remote audio tracks after join completes", async () => {
        const initialPublication = createAudioPublication("aud-initial");
        seededRemotePublications.push({
            participantIdentity: "@alice:example.org::device-a",
            participantSid: "remote-a",
            publication: initialPublication,
        });

        const ref = createRef<VoiceRoomHandle>();

        await act(async () => {
            root.render(
                React.createElement(VoiceRoom, {
                    ref,
                    client: {
                        getUserId: () => "@self:example.org",
                        getUser: () => ({ rawDisplayName: "Self" }),
                        mxcUrlToHttp: () => null,
                        getRoom: () => null,
                    },
                    matrixRoomId: "!voice:example.org",
                    matrixRoom: null,
                    audioSettings: createAudioSettings(),
                    onAudioSettingsChange: () => undefined,
                }),
            );
        });

        await act(async () => {
            await ref.current?.join();
        });

        const room = createdRooms[0];
        expect(room).toBeTruthy();
        expect(initialPublication.setSubscribed).toHaveBeenCalledWith(true);

        const latePublication = createAudioPublication("aud-late");

        await act(async () => {
            room.emit(RoomEvent.TrackPublished, latePublication);
        });

        expect(latePublication.setSubscribed).toHaveBeenCalledWith(true);

        await act(async () => {
            room.emit(RoomEvent.TrackSubscribed, latePublication.track, latePublication);
        });

        const attachedSids = Array.from(container.querySelectorAll("audio[data-lk-track-sid]"))
            .map((node) => node.getAttribute("data-lk-track-sid"))
            .filter((value): value is string => typeof value === "string" && value.length > 0);

        expect(attachedSids).toContain("aud-initial");
        expect(attachedSids).toContain("aud-late");
        expect(playAttempts).toContain("aud-late");
        expect(voiceAdapterMocks.fetchLiveKitToken).toHaveBeenCalledTimes(1);
    });

    it("shows two screen shares side by side, and one large when picked", async () => {
        const attached: string[] = [];
        const screenShare = (owner: string): FakePublication =>
            ({
                kind: "video",
                source: "screen_share",
                isSubscribed: true,
                trackSid: `screen-${owner}`,
                track: createAudioTrack(`screen-${owner}`),
                videoTrack: {
                    attach: () => attached.push(owner),
                    detach: () => [],
                },
                setSubscribed: vi.fn(),
            }) as unknown as FakePublication;
        seededRemotePublications.push(
            { participantIdentity: "@alice:example.org::a", participantSid: "remote-a", publication: screenShare("alice") },
            { participantIdentity: "@bob:example.org::b", participantSid: "remote-b", publication: screenShare("bob") },
        );
        const ref = createRef<VoiceRoomHandle>();
        await act(async () => {
            root.render(
                React.createElement(VoiceRoom, {
                    ref,
                    client: {
                        getUserId: () => "@self:example.org",
                        getUser: () => ({ displayName: "Self" }),
                        mxcUrlToHttp: () => null,
                        getRoom: () => null,
                    },
                    matrixRoomId: "!voice:example.org",
                    matrixRoom: null,
                    audioSettings: createAudioSettings(),
                    onAudioSettingsChange: () => undefined,
                }),
            );
        });
        await act(async () => {
            await ref.current?.join();
        });

        const tiles = container.querySelectorAll<HTMLButtonElement>("[data-testid=screen-share-tile]");
        expect(tiles).toHaveLength(2);
        expect(attached).toEqual(expect.arrayContaining(["alice", "bob"]));
        expect(container.textContent).toContain("2 streams live");

        await act(async () => {
            tiles[1].click();
        });
        expect(container.querySelectorAll("[data-testid=screen-share-tile]")).toHaveLength(0);
        expect(container.querySelectorAll(".voice-room-stage-video")).toHaveLength(1);
        expect(container.textContent).toContain("is live");

        const showAll = [...container.querySelectorAll<HTMLButtonElement>(".voice-room-stage-picker-button")].find(
            (button) => button.textContent === "Show all",
        );
        await act(async () => {
            showAll?.click();
        });
        expect(container.querySelectorAll("[data-testid=screen-share-tile]")).toHaveLength(2);
    });

    describe("MatrixRTC (Element Call compatible)", () => {
        const roomId = "!voice:example.org";
        const transport = { type: "livekit", livekit_service_url: "https://rtc.example.org/livekit/jwt" };

        function createRtcClient(
            session: FakeRtcSession,
            encrypted: boolean,
            permissions: { callMemberLevel?: number; ownLevel?: number } = {},
        ): Record<string, unknown> & { sendStateEvent: ReturnType<typeof vi.fn> } {
            const { callMemberLevel = 0, ownLevel = 0 } = permissions;
            const powerLevels = {
                users_default: 0,
                state_default: 50,
                events: { "m.room.power_levels": 100, "org.matrix.msc3401.call.member": callMemberLevel },
            };
            const fakeRoom = {
                roomId,
                hasEncryptionStateEvent: () => encrypted,
                currentState: {
                    getStateEvents: (type: string) =>
                        type === "m.room.power_levels" ? { getContent: () => powerLevels } : null,
                    maySendStateEvent: (type: string) =>
                        ownLevel >= ((powerLevels.events as Record<string, number>)[type] ?? powerLevels.state_default),
                },
            };
            return {
                getUserId: () => "@self:example.org",
                getSafeUserId: () => "@self:example.org",
                getDeviceId: () => "SELFDEVICE",
                getUser: () => ({ rawDisplayName: "Self" }),
                mxcUrlToHttp: () => null,
                getRoom: (id: string) => (id === roomId ? fakeRoom : null),
                getStateEvent: vi.fn(async () => powerLevels),
                sendStateEvent: vi.fn(async () => ({})),
                matrixRTC: { getRoomSession: () => session },
            };
        }

        async function renderAndJoin(client: Record<string, unknown>): Promise<React.RefObject<VoiceRoomHandle | null>> {
            const ref = createRef<VoiceRoomHandle>();
            await act(async () => {
                root.render(
                    React.createElement(VoiceRoom, {
                        ref,
                        client: client as never,
                        matrixRoomId: roomId,
                        matrixRoom: null,
                        audioSettings: createAudioSettings(),
                        onAudioSettingsChange: () => undefined,
                    }),
                );
            });
            await act(async () => {
                await ref.current?.join();
            });
            return ref;
        }

        beforeEach(() => {
            voiceAdapterMocks.discoverLiveKitTransport.mockResolvedValue(transport);
        });

        it("joins with the SFU credentials and an Element Call compatible membership", async () => {
            const session = createRtcSession();
            await renderAndJoin(createRtcClient(session, false));

            expect(voiceAdapterMocks.fetchLiveKitToken).not.toHaveBeenCalled();
            expect(voiceAdapterMocks.fetchSfuCredentials).toHaveBeenCalledWith(
                expect.anything(),
                transport,
                roomId,
                expect.anything(),
            );
            expect(createdRooms[0].connectArgs).toEqual(["wss://sfu.example.org", "sfu-jwt"]);
            expect(createdRooms[0].options.e2ee).toBeUndefined();
            expect(session.joinRTCSession).toHaveBeenCalledWith(
                { userId: "@self:example.org", deviceId: "SELFDEVICE", memberId: "@self:example.org:SELFDEVICE" },
                [],
                { ...transport, livekit_alias: roomId },
                { callIntent: "audio", manageMediaKeys: false, useExperimentalToDeviceTransport: true },
            );
            // Voice channels are persistent hangouts: joining never rings or notifies anyone.
            expect(session.joinRTCSession.mock.calls[0][3]).not.toHaveProperty("notificationType");
        });

        it("shows your own profile picture in the call, before your membership has synced", async () => {
            const session = createRtcSession();
            const client = createRtcClient(session, false);
            client.getUser = () => ({ displayName: "Self", avatarUrl: "mxc://example.org/self" });
            client.mxcUrlToHttp = (mxc: string) => `https://media.example.org/${mxc.slice("mxc://".length)}`;
            await renderAndJoin(client);

            const own = [...container.querySelectorAll(".voice-room-participant [data-avatar]")].find(
                (node) => node.textContent === "Self",
            );
            expect(own?.getAttribute("data-src")).toBe("https://media.example.org/example.org/self");
        });

        it("leaves after five minutes alone in the call, and says why", async () => {
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                const session = createRtcSession();
                await renderAndJoin(createRtcClient(session, false));
                expect(createdRooms[0].state).toBe("connected");

                await act(async () => {
                    vi.advanceTimersByTime(5 * 60_000);
                });
                await act(async () => {
                    await Promise.resolve();
                });
                expect(createdRooms[0].state).toBe("disconnected");
                expect(container.textContent).toContain("nobody else was in it for 5 minutes");
            } finally {
                vi.useRealTimers();
            }
        });

        it("enables E2EE in encrypted rooms and hands media keys to LiveKit", async () => {
            const session = createRtcSession();
            await renderAndJoin(createRtcClient(session, true));

            const room = createdRooms[0];
            const e2ee = room.options.e2ee as { keyProvider: { keyProviderOptions: unknown }; worker: unknown };
            expect(e2ee.worker).toBe(createdWorkers[0]);
            expect(e2ee.keyProvider.keyProviderOptions).toEqual({ ratchetWindowSize: 10, keyringSize: 256 });
            expect(room.setE2EEEnabled).toHaveBeenCalledWith(true);
            expect(session.joinRTCSession.mock.calls[0][3]).toMatchObject({ manageMediaKeys: true });

            await act(async () => {
                session.emit("encryption_key_changed", new Uint8Array([1, 2, 3]), 4, {}, "@bob:example.org:BOBDEVICE");
                await Promise.resolve();
            });
            expect(keyProviderKeys).toEqual([
                { key: { importedBytes: new Uint8Array([1, 2, 3]) }, identity: "@bob:example.org:BOBDEVICE", index: 4 },
            ]);
        });

        it("leaves the session and releases the E2EE worker on leave", async () => {
            const session = createRtcSession();
            const ref = await renderAndJoin(createRtcClient(session, true));
            expect(session.listenerCount()).toBeGreaterThan(0);

            await act(async () => {
                await ref.current?.leave();
            });

            expect(session.leaveRoomSession).toHaveBeenCalledTimes(1);
            expect(session.listenerCount()).toBe(0);
            expect(createdWorkers[0].terminate).toHaveBeenCalledTimes(1);
            expect(voiceAdapterMocks.updateVoiceParticipantState).not.toHaveBeenCalled();
        });

        it("explains instead of joining when the member may not join calls", async () => {
            const session = createRtcSession();
            await renderAndJoin(createRtcClient(session, false, { callMemberLevel: 50, ownLevel: 0 }));

            expect(container.textContent).toContain("Your role can't join calls in this channel yet.");
            expect(createdRooms).toHaveLength(0);
            expect(voiceAdapterMocks.fetchSfuCredentials).not.toHaveBeenCalled();
            expect(session.joinRTCSession).not.toHaveBeenCalled();
        });

        it("offers admins of older voice channels to let members join calls", async () => {
            const session = createRtcSession();
            const client = createRtcClient(session, false, { callMemberLevel: 50, ownLevel: 100 });
            await renderAndJoin(client);

            const fixButton = Array.from(container.querySelectorAll("button")).find(
                (button) => button.textContent === "Allow members to join calls",
            );
            expect(fixButton).toBeTruthy();
            await act(async () => {
                fixButton!.click();
                await Promise.resolve();
            });

            expect(client.sendStateEvent).toHaveBeenCalledWith(
                roomId,
                "m.room.power_levels",
                expect.objectContaining({
                    events: { "m.room.power_levels": 100, "org.matrix.msc3401.call.member": 0 },
                }),
                "",
            );
            expect(container.textContent).not.toContain("Allow members to join calls");
        });

        it("lists call members but not subscriber-only connections", async () => {
            seededRemotePublications.push(
                {
                    participantIdentity: "@bob:example.org:BOBDEVICE",
                    participantSid: "remote-bob",
                    publication: createAudioPublication("aud-bob"),
                },
                {
                    participantIdentity: "c29tZWhhc2hlZGlkZW50aXR5",
                    participantSid: "remote-subscriber",
                    publication: null,
                },
            );
            const session = createRtcSession([
                { rtcBackendIdentity: "@bob:example.org:BOBDEVICE", userId: "@bob:example.org" },
            ]);
            await renderAndJoin(createRtcClient(session, false));

            expect(container.textContent).toContain("@bob:example.org");
            expect(container.textContent).not.toContain("c29tZWhhc2hlZGlkZW50aXR5");
        });
    });
    describe("live audio settings (no leaving the call)", () => {
        const client = {
            getUserId: () => "@self:example.org",
            getUser: () => ({ rawDisplayName: "Self" }),
            mxcUrlToHttp: () => null,
            getRoom: () => null,
        };

        async function renderWith(audioSettings: AudioSettings, ref = createRef<VoiceRoomHandle>()): Promise<React.RefObject<VoiceRoomHandle | null>> {
            await act(async () => {
                root.render(
                    React.createElement(VoiceRoom, {
                        ref,
                        client: client as never,
                        matrixRoomId: "!voice:example.org",
                        matrixRoom: null,
                        audioSettings,
                        onAudioSettingsChange: () => undefined,
                    }),
                );
            });
            return ref;
        }

        it("restarts the existing mic track when processing settings change mid-call", async () => {
            const settings = createAudioSettings();
            const ref = await renderWith(settings);
            await act(async () => {
                await ref.current?.join();
            });
            const room = createdRooms[0];
            room.localParticipant.setMicrophoneEnabled.mockClear();

            await renderWith({ ...settings, noiseSuppressionEnabled: false, preferredAudioInputId: "usb-mic" }, ref);
            await act(async () => {
                await Promise.resolve();
            });

            expect(micRestarts).toHaveBeenCalledWith(
                expect.objectContaining({ noiseSuppression: false, deviceId: { exact: "usb-mic" } }),
            );
            // Not unpublished, not disconnected.
            expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalledWith(false);
            expect(voiceAdapterMocks.fetchLiveKitToken).toHaveBeenCalledTimes(1);
        });

        it("republishes only when the speech/music profile changes", async () => {
            const settings = createAudioSettings();
            const ref = await renderWith(settings);
            await act(async () => {
                await ref.current?.join();
            });
            const room = createdRooms[0];
            micRestarts.mockClear();

            await renderWith({ ...settings, micProfile: "music" }, ref);
            await act(async () => {
                await Promise.resolve();
            });

            expect(micRestarts).not.toHaveBeenCalled();
            expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
        });

        it("switches the speaker mid-call, including back to the system default", async () => {
            const settings = createAudioSettings();
            const ref = await renderWith({ ...settings, preferredAudioOutputId: "headset" });
            await act(async () => {
                await ref.current?.join();
            });
            const room = createdRooms[0];
            expect(room.switchActiveDevice).toHaveBeenCalledWith("audiooutput", "headset");

            await renderWith({ ...settings, preferredAudioOutputId: "default" }, ref);
            expect(room.switchActiveDevice).toHaveBeenLastCalledWith("audiooutput", "default");
        });
    });
});
