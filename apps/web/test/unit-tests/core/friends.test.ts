// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { EMPTY_FRIENDS, applyMine, applyTheirs, friendStatus, parseFriends } from "../../../src/core/friends/friends";

const BOB = "@bob:example.org";

describe("friends", () => {
    it("goes request → accept on both sides", () => {
        const alice = applyMine(EMPTY_FRIENDS, BOB, "request");
        expect(friendStatus(alice, BOB)).toBe("outgoing");
        const bob = applyTheirs(EMPTY_FRIENDS, "@alice:example.org", "request", 1);
        expect(friendStatus(bob, "@alice:example.org")).toBe("incoming");
        const bobAccepted = applyMine(bob, "@alice:example.org", "accept");
        expect(friendStatus(bobAccepted, "@alice:example.org")).toBe("friends");
        expect(friendStatus(applyTheirs(alice, BOB, "accept", 2), BOB)).toBe("friends");
    });

    it("treats two requests as a yes and ignores old notices", () => {
        const asked = applyMine(EMPTY_FRIENDS, BOB, "request");
        const both = applyTheirs(asked, BOB, "request", 5);
        expect(friendStatus(both, BOB)).toBe("friends");
        expect(applyTheirs(both, BOB, "remove", 4)).toBe(both);
        expect(friendStatus(applyTheirs(both, BOB, "remove", 6), BOB)).toBe("none");
    });

    it("ignores accepts nobody asked for, and cancels", () => {
        expect(friendStatus(applyTheirs(EMPTY_FRIENDS, BOB, "accept", 1), BOB)).toBe("none");
        const incoming = applyTheirs(EMPTY_FRIENDS, BOB, "request", 1);
        expect(friendStatus(applyTheirs(incoming, BOB, "cancel", 2), BOB)).toBe("none");
    });

    it("parses defensively", () => {
        expect(parseFriends(null)).toEqual(EMPTY_FRIENDS);
        const parsed = parseFriends({ friends: [BOB, "nope", 3], incoming: [BOB], outgoing: [], seen: { [BOB]: 3, x: "y" } });
        expect(parsed.friends).toEqual([BOB]);
        expect(parsed.incoming).toEqual([]);
        expect(parsed.seen).toEqual({ [BOB]: 3 });
    });
});
