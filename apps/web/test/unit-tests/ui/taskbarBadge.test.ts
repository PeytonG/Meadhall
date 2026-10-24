// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { badgeLabel, unreadNotificationTotal } from "../../../src/ui/notifications/taskbarBadge";

describe("taskbar badge", () => {
    it("shows 1-9, then 9+", () => {
        expect(badgeLabel(1)).toBe("1");
        expect(badgeLabel(9)).toBe("9");
        expect(badgeLabel(10)).toBe("9+");
        expect(badgeLabel(250)).toBe("9+");
    });

    it("adds up notifications in joined rooms, skipping spaces and rooms you've left", () => {
        const room = (count: number, membership = "join", space = false) => ({
            getMyMembership: () => membership,
            isSpaceRoom: () => space,
            getUnreadNotificationCount: () => count,
        });
        const client = { getUserId: () => "@me:example.org", getRooms: () => [room(2), room(3), room(7, "leave"), room(4, "join", true), room(0)] };
        expect(unreadNotificationTotal(client as never)).toBe(5);
    });
});
