// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { collapse } from "../../../src/core/accounts/otherAccountNotifications";

const item = (room: string, type: string, ts: number, content: Record<string, unknown> = {}) => ({ room_id: room, ts, event: { event_id: `$${room}${ts}`, type, content } });

describe("other accounts' notifications during calls", () => {
    it("collapse call traffic to one notification per conversation, readable messages first", () => {
        const result = collapse(
            [
                item("!dm", "m.room.encrypted", 1),
                item("!dm", "m.room.encrypted", 2),
                item("!dm", "m.room.encrypted", 3),
                item("!dm", "org.matrix.msc4075.rtc.notification", 4, { notification_type: "notification" }),
                item("!group", "m.room.encrypted", 5),
                item("!group", "m.room.message", 6, { body: "hi" }),
                item("!ring", "org.matrix.msc4075.rtc.notification", 7, { notification_type: "ring" }),
            ],
            "@me:x",
            1_000_000,
        );
        expect(result.map((entry) => `${entry.room_id} ${entry.event.type}`)).toEqual(["!dm m.room.encrypted", "!group m.room.message", "!ring org.matrix.msc4075.rtc.notification"]);
    });

    it("say 'New encrypted message' at most once a minute per conversation", () => {
        expect(collapse([item("!quiet", "m.room.encrypted", 1)], "@me:x", 2_000_000)).toHaveLength(1);
        expect(collapse([item("!quiet", "m.room.encrypted", 2)], "@me:x", 2_030_000)).toHaveLength(0);
        expect(collapse([item("!quiet", "m.room.encrypted", 3)], "@me:x", 2_070_000)).toHaveLength(1);
    });
});
