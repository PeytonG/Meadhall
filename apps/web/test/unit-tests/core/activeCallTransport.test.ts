// SPDX-License-Identifier: AGPL-3.0-only
// Calls across homeservers: join the call server of whoever has been in the call longest (MSC4143 oldest_membership).
import { describe, expect, it } from "vitest";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { activeCallTransport } from "../../../src/core/voice/matrixRtc";

function clientWith(oldest: { sender: string; transport: unknown } | undefined): MatrixClient {
    const membership = oldest ? { sender: oldest.sender, getTransport: () => oldest.transport } : undefined;
    return {
        getUserId: () => "@me:here.org",
        matrixRTC: { getRoomSession: () => ({ getOldestMembership: () => membership }) },
    } as unknown as MatrixClient;
}

const room = {} as Room;

describe("activeCallTransport", () => {
    it("uses the call server of the person who has been in the call longest", () => {
        const client = clientWith({ sender: "@them:there.org", transport: { type: "livekit", livekit_service_url: "https://rtc.there.org/" } });
        expect(activeCallTransport(client, room)).toEqual({ type: "livekit", livekit_service_url: "https://rtc.there.org" });
    });

    it("is ours to pick when nobody is in the call, or we were first", () => {
        expect(activeCallTransport(clientWith(undefined), room)).toBeNull();
        expect(activeCallTransport(clientWith({ sender: "@me:here.org", transport: { type: "livekit", livekit_service_url: "https://rtc.here.org" } }), room)).toBeNull();
    });

    it("ignores transports that aren't LiveKit or aren't https", () => {
        expect(activeCallTransport(clientWith({ sender: "@them:there.org", transport: { type: "other" } }), room)).toBeNull();
        expect(activeCallTransport(clientWith({ sender: "@them:there.org", transport: { type: "livekit", livekit_service_url: "http://evil.example" } }), room)).toBeNull();
    });
});
