// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendSticker } from "../../../../src/ui/stickers/sendSticker";
import { STICKERS } from "../../../../src/ui/stickers/stickerPack";

function makeClient(homeserver = "https://hs.example.org"): any {
    let uploads = 0;
    return {
        getHomeserverUrl: () => homeserver,
        uploadContent: vi.fn(async () => ({ content_uri: `mxc://example.org/sticker${(uploads += 1)}` })),
        sendEvent: vi.fn(async () => ({ event_id: "$sent" })),
    };
}

describe("sendSticker", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob([new Uint8Array(321)]) })) as any;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("ships the whole pixel pack", () => {
        expect(STICKERS.map((sticker) => sticker.id)).toEqual([
            "cheers", "heart", "crown", "shield", "sword", "fire", "coin", "gg", "thumbs_up", "lol", "skull", "sparkles",
        ]);
    });

    it("sends a standard m.sticker event", async () => {
        const client = makeClient();
        await sendSticker(client, "!room:example.org", STICKERS[0]);

        expect(client.sendEvent).toHaveBeenCalledWith("!room:example.org", "m.sticker", {
            body: "Cheers",
            url: "mxc://example.org/sticker1",
            info: { w: 128, h: 128, mimetype: "image/png", size: 321 },
        });
    });

    it("decodes inlined data: URLs instead of fetching them (blocked by the CSP)", async () => {
        const client = makeClient();
        const inlined = { ...STICKERS[2], url: `data:image/png;base64,${btoa("pixel")}` };
        await sendSticker(client, "!room:example.org", inlined);

        expect(globalThis.fetch).not.toHaveBeenCalled();
        const uploaded = client.uploadContent.mock.calls[0][0] as Blob;
        expect(uploaded.type).toBe("image/png");
        expect(await uploaded.text()).toBe("pixel");
    });

    it("uploads each sticker once per homeserver", async () => {
        const client = makeClient();
        await sendSticker(client, "!a:example.org", STICKERS[1]);
        await sendSticker(client, "!b:example.org", STICKERS[1]);
        expect(client.uploadContent).toHaveBeenCalledTimes(1);
        expect(client.sendEvent.mock.calls[1][2].url).toBe("mxc://example.org/sticker1");

        const otherServer = makeClient("https://other.example.net");
        await sendSticker(otherServer, "!c:example.net", STICKERS[1]);
        expect(otherServer.uploadContent).toHaveBeenCalledTimes(1);
    });
});
