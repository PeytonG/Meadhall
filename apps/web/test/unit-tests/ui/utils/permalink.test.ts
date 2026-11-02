// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { buildMatrixToEventPermalink, buildMeadhallEventLink, buildMeadhallRoomLink, parseAppLink } from "../../../../src/ui/utils/permalink";

describe("app links", () => {
    it("round-trips Meadhall message and room links", () => {
        expect(parseAppLink(buildMeadhallEventLink("!abc:example.org", "$ev1"))).toEqual({ room: "!abc:example.org", eventId: "$ev1" });
        expect(parseAppLink(buildMeadhallRoomLink("!abc:example.org"))).toEqual({ room: "!abc:example.org", eventId: null });
        // Room version 12 IDs have no server part.
        expect(parseAppLink(buildMeadhallEventLink("!Q2zWc8vT_3kf", "$ev1"))).toEqual({ room: "!Q2zWc8vT_3kf", eventId: "$ev1" });
    });

    it("opens matrix.to room and message links in the app", () => {
        expect(parseAppLink(buildMatrixToEventPermalink("!abc:example.org", "$ev1"))).toEqual({ room: "!abc:example.org", eventId: "$ev1" });
        expect(parseAppLink("https://matrix.to/#/%23hall%3Aexample.org?via=example.org")).toEqual({ room: "#hall:example.org", eventId: null });
        expect(parseAppLink("https://matrix.to/#/#hall:example.org/$ev2?via=example.org")).toEqual({ room: "#hall:example.org", eventId: "$ev2" });
    });

    it("reads matrix: URIs", () => {
        expect(parseAppLink("matrix:roomid/abc:example.org/e/ev1?via=example.org")).toEqual({ room: "!abc:example.org", eventId: "$ev1" });
        expect(parseAppLink("matrix:r/hall:example.org")).toEqual({ room: "#hall:example.org", eventId: null });
    });

    it("leaves people and other sites to the browser", () => {
        expect(parseAppLink("https://matrix.to/#/@alice:example.org")).toBeNull();
        expect(parseAppLink("https://example.org/#/!abc:example.org")).toBeNull();
        expect(parseAppLink("meadhall://room/not-a-room")).toBeNull();
    });
});
