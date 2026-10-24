// SPDX-License-Identifier: AGPL-3.0-only
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { describe, expect, it, vi } from "vitest";

import { isServerNoticesDisabled, listActiveUserIds, parseNoticeRecipients, sendServerNotice } from "../../../src/core/admin/synapseAdmin";

describe("server notices", () => {
    it("turns names into user IDs on this server and drops duplicates", () => {
        expect(parseNoticeRecipients("alice, @bob:other.org;  @alice:example.org\ncarol:third.org", "example.org")).toEqual([
            "@alice:example.org",
            "@bob:other.org",
            "@carol:third.org",
        ]);
        expect(parseNoticeRecipients("  ,  ", "example.org")).toEqual([]);
    });

    it("pages through every user and skips deactivated accounts", async () => {
        const authedRequest = vi
            .fn()
            .mockResolvedValueOnce({ users: [{ name: "@a:x" }, { name: "@gone:x", deactivated: true }], total: 3, next_token: "2" })
            .mockResolvedValueOnce({ users: [{ name: "@b:x" }], total: 3 });
        const client = { http: { authedRequest } } as unknown as MatrixClient;
        expect(await listActiveUserIds(client)).toEqual(["@a:x", "@b:x"]);
        expect(authedRequest.mock.calls[1][2]).toMatchObject({ from: "2" });
    });

    it("sends one text message per user with its own transaction ID", async () => {
        const authedRequest = vi.fn().mockResolvedValue({ event_id: "$e" });
        const client = { http: { authedRequest } } as unknown as MatrixClient;
        await sendServerNotice(client, "@a:x", "Hello");
        await sendServerNotice(client, "@a:x", "Hello");
        const [first, second] = authedRequest.mock.calls;
        expect(first[0]).toBe("PUT");
        expect(first[1]).toMatch(/^\/v1\/send_server_notice\//);
        expect(first[1]).not.toBe(second[1]);
        expect(first[3]).toEqual({ user_id: "@a:x", content: { msgtype: "m.text", body: "Hello" } });
    });

    it("recognises a server without server notices", () => {
        expect(isServerNoticesDisabled({ data: { error: "Server notices are not enabled on this server" } })).toBe(true);
        expect(isServerNoticesDisabled(new Error("network"))).toBe(false);
    });
});
