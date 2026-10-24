// SPDX-License-Identifier: AGPL-3.0-only
import { EventEmitter } from "events";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { describe, expect, it } from "vitest";

import { buildPresenceVm, toAvatarPresenceState } from "../../../src/ui/presence/buildPresenceVm";
import { serverSharesPresence } from "../../../src/ui/presence/presenceSupport";

function fakeClient(users: Array<{ userId: string; presence: boolean }>, synced = true) {
    const emitter = new EventEmitter();
    const list = users.map((user) => ({ userId: user.userId, events: user.presence ? { presence: {} } : {} }));
    return Object.assign(emitter, {
        getDomain: () => "home.org",
        getUsers: () => list,
        isInitialSyncComplete: () => synced,
        list,
    });
}

describe("presence support per server", () => {
    it("shows ? only for servers we've never had presence from", () => {
        const client = fakeClient([
            { userId: "@a:shares.org", presence: true },
            { userId: "@b:shares.org", presence: false },
            { userId: "@c:matrix.org", presence: false },
            { userId: "@d:home.org", presence: false },
        ]);
        const asClient = client as unknown as MatrixClient;
        expect(serverSharesPresence(asClient, "@b:shares.org")).toBe(true);
        expect(serverSharesPresence(asClient, "@c:matrix.org")).toBe(false);
        expect(serverSharesPresence(asClient, "@d:home.org")).toBe(true);

        // Presence arriving later from that server clears the ?.
        client.emit("User.presence", {}, { userId: "@c:matrix.org", events: { presence: {} } });
        expect(serverSharesPresence(asClient, "@c:matrix.org")).toBe(true);
    });

    it("doesn't decide before the first sync is done", () => {
        const client = fakeClient([], false) as unknown as MatrixClient;
        expect(serverSharesPresence(client, "@c:matrix.org")).toBe(true);
    });

    it("renders unsupported as a ? badge with an explanation", () => {
        const vm = buildPresenceVm({ presence: "offline", statusMessage: "hi", unsupported: true });
        expect(vm).toMatchObject({ state: "unknown", primaryLabel: "Status unavailable", statusText: null });
        expect(toAvatarPresenceState(vm)).toBe("unsupported");
        expect(toAvatarPresenceState(buildPresenceVm({ presence: "offline" }))).toBe("offline");
    });
});
