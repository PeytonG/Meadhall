import { afterEach, describe, expect, it, vi } from "vitest";

import {
    MatrixRtcKeyProvider,
    buildRtcIdentityMap,
    discoverLiveKitTransport,
    fetchSfuCredentials,
    getRtcVoiceParticipants,
    parseMatrixUserIdFromIdentity,
} from "../../../../src/core/voice/matrixRtc";

function makeClient(overrides: Record<string, unknown> = {}): any {
    return {
        _unstable_getRTCTransports: vi.fn(async () => {
            throw new Error("M_UNRECOGNIZED");
        }),
        getClientWellKnown: () => undefined,
        getOpenIdToken: vi.fn(async () => ({ access_token: "openid", matrix_server_name: "example.org" })),
        getDeviceId: () => "DEVICE1",
        ...overrides,
    };
}

describe("matrixRtc", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe("discoverLiveKitTransport", () => {
        it("prefers the homeserver's MSC4143 transports", async () => {
            const client = makeClient({
                _unstable_getRTCTransports: async () => [
                    { type: "other" },
                    { type: "livekit", livekit_service_url: "https://rtc.example.org/" },
                ],
                getClientWellKnown: () => ({
                    "org.matrix.msc4143.rtc_foci": [{ type: "livekit", livekit_service_url: "https://wk.example.org" }],
                }),
            });

            await expect(discoverLiveKitTransport(client, null)).resolves.toEqual({
                type: "livekit",
                livekit_service_url: "https://rtc.example.org",
            });
        });

        it("falls back to .well-known rtc_foci, then config livekit_service_url", async () => {
            const wellKnownClient = makeClient({
                getClientWellKnown: () => ({
                    "org.matrix.msc4143.rtc_foci": [{ type: "livekit", livekit_service_url: "https://wk.example.org" }],
                }),
            });
            await expect(discoverLiveKitTransport(wellKnownClient, null)).resolves.toMatchObject({
                livekit_service_url: "https://wk.example.org",
            });

            const configClient = makeClient();
            await expect(
                discoverLiveKitTransport(configClient, { livekit_service_url: "https://cfg.example.org" }),
            ).resolves.toMatchObject({ livekit_service_url: "https://cfg.example.org" });
        });

        it("returns null (relay fallback) when nothing is advertised or the URL is insecure", async () => {
            await expect(discoverLiveKitTransport(makeClient(), null)).resolves.toBeNull();
            await expect(
                discoverLiveKitTransport(makeClient(), { livekit_service_url: "http://evil.example.org" }),
            ).resolves.toBeNull();
        });
    });

    it("fetchSfuCredentials posts the OpenID token to /sfu/get", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ url: "wss://sfu.example.org", jwt: "jwt-token" }),
        }));
        globalThis.fetch = fetchMock as any;

        const result = await fetchSfuCredentials(
            makeClient(),
            { type: "livekit", livekit_service_url: "https://rtc.example.org" },
            "!room:example.org",
        );

        expect(result).toEqual({ url: "wss://sfu.example.org", jwt: "jwt-token" });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://rtc.example.org/sfu/get");
        expect(JSON.parse(init.body as string)).toEqual({
            room: "!room:example.org",
            openid_token: { access_token: "openid", matrix_server_name: "example.org" },
            device_id: "DEVICE1",
        });
    });

    it("fetchSfuCredentials surfaces HTTP status for retry handling", async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;

        await expect(
            fetchSfuCredentials(makeClient(), { type: "livekit", livekit_service_url: "https://rtc.example.org" }, "!r:x"),
        ).rejects.toMatchObject({ status: 503 });
    });

    describe("parseMatrixUserIdFromIdentity", () => {
        it("strips the device ID from MatrixRTC identities", () => {
            expect(parseMatrixUserIdFromIdentity("@alice:example.org:ABCDEFGHIJ")).toBe("@alice:example.org");
            expect(parseMatrixUserIdFromIdentity("@alice:example.org:8448:ABCDEFGHIJ")).toBe("@alice:example.org:8448");
        });

        it("keeps relay identities working", () => {
            expect(parseMatrixUserIdFromIdentity("@alice:example.org")).toBe("@alice:example.org");
            expect(parseMatrixUserIdFromIdentity("@alice:example.org::tab-2")).toBe("@alice:example.org");
            expect(parseMatrixUserIdFromIdentity("@alice:example.org:8448")).toBe("@alice:example.org:8448");
        });

        it("rejects non-Matrix identities", () => {
            expect(parseMatrixUserIdFromIdentity("3f9a0c")).toBeUndefined();
            expect(parseMatrixUserIdFromIdentity("@alice")).toBeUndefined();
        });
    });

    it("maps hashed rtcBackendIdentity values to user IDs", () => {
        const map = buildRtcIdentityMap([{ rtcBackendIdentity: "c0ffee", userId: "@bob:example.org" }] as any);
        expect(map.get("c0ffee")).toBe("@bob:example.org");
    });

    it("lists one participant per user from session memberships", () => {
        const memberships = [
            { userId: "@bob:example.org", rtcBackendIdentity: "a" },
            { userId: "@bob:example.org", rtcBackendIdentity: "b" },
            { userId: "@carol:example.org", rtcBackendIdentity: "c" },
        ];
        const client = { matrixRTC: { getRoomSession: () => ({ memberships }) } } as any;

        const result = getRtcVoiceParticipants(client, { roomId: "!room:example.org" } as any);

        expect(result.count).toBe(2);
        expect(result.participants.map((p) => p.matrixUserId)).toEqual(["@bob:example.org", "@carol:example.org"]);
    });

    it("imports raw media keys as HKDF and hands them to LiveKit", async () => {
        const provider = new MatrixRtcKeyProvider();
        const emitted: Array<{ participantIdentity?: string; keyIndex?: number; key: CryptoKey }> = [];
        provider.on("setKey", (info: any) => emitted.push(info));

        await provider.setRawKey(new Uint8Array(16).fill(7), "@bob:example.org:DEV", 3);

        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toMatchObject({ participantIdentity: "@bob:example.org:DEV", keyIndex: 3 });
        expect(emitted[0].key.algorithm.name).toBe("HKDF");
        expect(provider.getOptions()).toMatchObject({ ratchetWindowSize: 10, keyringSize: 256 });
    });
});
