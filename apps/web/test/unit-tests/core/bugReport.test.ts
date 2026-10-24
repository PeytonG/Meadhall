// SPDX-License-Identifier: AGPL-3.0-only
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    BUG_REPORT_ROOM_TYPE,
    DEFAULT_BUG_REPORT_RECIPIENT,
    canSendBugReport,
    formatBugReport,
    getBugReportRecipient,
    sendBugReport,
} from "../../../src/core/bugReport/bugReport";

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        createRoom: vi.fn().mockResolvedValue({ room_id: "!report:example.org" }),
        invite: vi.fn().mockResolvedValue({}),
        sendMessage: vi.fn().mockResolvedValue({ event_id: "$event" }),
        uploadContent: vi.fn().mockResolvedValue({ content_uri: "mxc://example.org/abc" }),
        leave: vi.fn().mockResolvedValue({}),
        forget: vi.fn().mockResolvedValue({}),
        ...overrides,
    };
}

beforeEach(() => window.localStorage.clear());

describe("bug reports", () => {
    it("goes to the developer unless config names a valid Matrix ID", () => {
        expect(getBugReportRecipient(null)).toBe(DEFAULT_BUG_REPORT_RECIPIENT);
        expect(getBugReportRecipient({ bug_report_recipient: "not an id" })).toBe(DEFAULT_BUG_REPORT_RECIPIENT);
        expect(getBugReportRecipient({ bug_report_recipient: "@dev:fork.example" })).toBe("@dev:fork.example");
    });

    it("formats the category, description and details", () => {
        const body = formatBugReport({ category: "Notifications", description: "  No sound  ", details: "Version: 1.0" });
        expect(body).toBe("🐞 Meadhall bug report\nCategory: Notifications\n\nNo sound\n\nVersion: 1.0");
    });

    it("sends into a fresh hidden room and allows three reports an hour", async () => {
        const client = fakeClient();
        const image = new File([new Uint8Array(4)], "shot.png", { type: "image/png" });
        await sendBugReport(client as unknown as MatrixClient, "@dev:example.org", { category: "Other", description: "Broken", image });
        expect(client.createRoom).toHaveBeenCalledWith(expect.objectContaining({ creation_content: { type: BUG_REPORT_ROOM_TYPE } }));
        expect(client.invite).toHaveBeenCalledWith("!report:example.org", "@dev:example.org");
        expect(client.sendMessage).toHaveBeenCalledTimes(2);
        expect(client.sendMessage.mock.calls[1][1]).toMatchObject({ msgtype: "m.image", url: "mxc://example.org/abc" });
        expect(client.leave).not.toHaveBeenCalled();

        await sendBugReport(client as unknown as MatrixClient, "@dev:example.org", { category: "Other", description: "Again" });
        await sendBugReport(client as unknown as MatrixClient, "@dev:example.org", { category: "Other", description: "Again" });
        expect(canSendBugReport()).toBe(false);
        await expect(sendBugReport(client as unknown as MatrixClient, "@dev:example.org", { category: "Other", description: "4th" })).rejects.toThrow(/hour/);
    });

    it("leaves and forgets the room when the developer can't be invited", async () => {
        const client = fakeClient({ invite: vi.fn().mockRejectedValue(new Error("federation")) });
        await expect(sendBugReport(client as unknown as MatrixClient, "@dev:example.org", { category: "Other", description: "x" })).rejects.toThrow(
            /developer's server/,
        );
        expect(client.leave).toHaveBeenCalledWith("!report:example.org");
        expect(client.forget).toHaveBeenCalledWith("!report:example.org");
        expect(client.sendMessage).not.toHaveBeenCalled();
        expect(canSendBugReport()).toBe(true);
    });

    it("refuses non-images and images over 8 MB before creating anything", async () => {
        const client = fakeClient();
        const text = new File(["x"], "notes.txt", { type: "text/plain" });
        await expect(sendBugReport(client as unknown as MatrixClient, "@d:e", { category: "Other", description: "x", image: text })).rejects.toThrow(/image/);
        expect(client.createRoom).not.toHaveBeenCalled();
    });
});
