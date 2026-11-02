// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    DEFAULT_REPORT_REASONS,
    expiredParts,
    modActionContent,
    parseModAction,
    parseReport,
    parseReportReasons,
    parseSanction,
    reasonsFromLabels,
    reportContent,
    sanctionContent,
} from "../../../src/core/moderation/moderationProtocol";

describe("report reasons", () => {
    it("falls back to the defaults and reads the owner's list", () => {
        expect(parseReportReasons(null)).toEqual(DEFAULT_REPORT_REASONS);
        expect(parseReportReasons({ reasons: [] })).toEqual(DEFAULT_REPORT_REASONS);
        expect(parseReportReasons({ reasons: [{ id: "promo", label: "Self-promotion" }, { id: "", label: "x" }] })).toEqual([{ id: "promo", label: "Self-promotion" }]);
    });

    it("makes unique ids from labels", () => {
        expect(reasonsFromLabels(["Curse words", "Curse words!", "  ", "Self-promotion"])).toEqual([
            { id: "curse-words", label: "Curse words" },
            { id: "curse-words-2", label: "Curse words!" },
            { id: "self-promotion", label: "Self-promotion" },
        ]);
    });
});

describe("reports", () => {
    it("round-trips a message report and drops bad ids", () => {
        const content = reportContent({ space: "!s:hs", reportedUser: "@bad:hs", reasonId: "spam", reason: "Spam", note: "keeps posting links", roomId: "!c:hs", eventId: "$e1", excerpt: "buy now" });
        expect(parseReport(content)).toEqual({ space: "!s:hs", reportedUser: "@bad:hs", reasonId: "spam", reason: "Spam", note: "keeps posting links", roomId: "!c:hs", eventId: "$e1", excerpt: "buy now" });
        expect(parseReport({ ...content, reported_user: "not-a-user" })).toBeNull();
        // Room version 12 IDs have no server part.
        expect(parseReport({ ...content, space: "!Q2zWc8vT_3kf" })?.space).toBe("!Q2zWc8vT_3kf");
        expect(parseReport({ ...content, event_id: "nope" })?.eventId).toBeUndefined();
    });
});

describe("moderation log", () => {
    it("reads actions and refuses unknown ones", () => {
        const content = modActionContent({ user: "@bad:hs", action: "timed_ban", reason: "spam", until: 5000 });
        expect(parseModAction(content, "@mod:hs", 1000)).toEqual({ user: "@bad:hs", action: "timed_ban", reason: "spam", until: 5000, by: "@mod:hs", at: 1000 });
        expect(parseModAction({ ...content, action: "explode" }, "@mod:hs", 1000)).toBeNull();
    });
});

describe("sanctions", () => {
    it("round-trips and reports what has expired", () => {
        const sanction = parseSanction(sanctionContent({ banUntil: 100, muteUntil: 300, shadow: true, mutedLevels: { "!c:hs": 10, "!d:hs": null } }));
        expect(sanction).toEqual({ banUntil: 100, muteUntil: 300, shadow: true, mutedLevels: { "!c:hs": 10, "!d:hs": null } });
        expect(expiredParts(sanction, 200)).toEqual({ ban: true, mute: false });
        expect(expiredParts({}, 200)).toEqual({ ban: false, mute: false });
        expect(parseSanction({ shadow: "yes", muted_levels: { bad: 1 } })).toEqual({ mutedLevels: {} });
    });
});
