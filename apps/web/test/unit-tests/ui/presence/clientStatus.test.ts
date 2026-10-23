// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from "vitest";

import { applyOwnStatus, STATUS_PROFILE_KEY } from "../../../../src/ui/presence/clientStatus";

function fakeClient(delays: { presence?: number; profile?: number } = {}) {
    const presence: unknown[] = [];
    const profile: unknown[] = [];
    const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
    return {
        presence,
        profile,
        client: {
            getSafeUserId: () => "@me:example.org",
            setSyncPresence: vi.fn(),
            setPresence: vi.fn(async (body: unknown) => {
                await wait(delays.presence);
                presence.push(body);
            }),
            setExtendedProfileProperty: vi.fn(async (key: string, value: unknown) => {
                await wait(delays.profile);
                if (key === STATUS_PROFILE_KEY) profile.push(value);
            }),
        } as never,
    };
}

describe("applying your status", () => {
    it("keeps sending changes after a call that had nothing new to send", async () => {
        const { client, profile, presence } = fakeClient();
        await applyOwnStatus(client, { state: "auto", text: "" });
        await applyOwnStatus(client, { state: "auto", text: "" }); // nothing new
        await applyOwnStatus(client, { state: "dnd", text: "Busy" });
        await vi.waitFor(() => expect(profile.at(-1)).toMatchObject({ state: "dnd" }));
        await vi.waitFor(() => expect(presence.at(-1)).toEqual({ presence: "unavailable", status_msg: "Busy" }));
    });

    it("ends on the newest status when changes overlap", async () => {
        const { client, profile } = fakeClient({ profile: 20 });
        void applyOwnStatus(client, { state: "online", text: "" });
        void applyOwnStatus(client, { state: "idle", text: "" });
        await applyOwnStatus(client, { state: "invisible", text: "" });
        await vi.waitFor(() => expect(profile.at(-1)).toMatchObject({ state: null }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(profile.at(-1)).toMatchObject({ state: null });
    });

    it("doesn't hold the profile field up behind a slow presence update", async () => {
        const { client, profile } = fakeClient({ presence: 5_000 });
        void applyOwnStatus(client, { state: "dnd", text: "Away from keyboard" });
        await vi.waitFor(() => expect(profile.at(-1)).toMatchObject({ state: "dnd" }), { timeout: 500 });
    });
});
