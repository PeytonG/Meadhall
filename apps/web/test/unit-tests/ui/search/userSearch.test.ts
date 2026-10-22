// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { matchesUserSearch, userSearchScore } from "../../../../src/ui/search/userSearch";

const peyton = ["@peytongna:elementprojectzkypg.duckdns.org", "Peyton Gnadinger"] as const;

describe("user search", () => {
    it("matches display names, usernames and user IDs", () => {
        expect(matchesUserSearch("Peyton", ...peyton)).toBe(true);
        expect(matchesUserSearch("gnadinger", ...peyton)).toBe(true);
        expect(matchesUserSearch("peytongna", ...peyton)).toBe(true);
        expect(matchesUserSearch("@peytongna:elementprojectzkypg", ...peyton)).toBe(true);
        expect(matchesUserSearch("bob", ...peyton)).toBe(false);
    });

    it("matches every word in any order, ignoring case and accents", () => {
        expect(matchesUserSearch("gnad pey", ...peyton)).toBe(true);
        expect(matchesUserSearch("PEYTON GNADINGER", ...peyton)).toBe(true);
        expect(matchesUserSearch("zoe", "@zoe:hs", "Zoë Brontë")).toBe(true);
        expect(matchesUserSearch("bronte", "@zoe:hs", "Zoë Brontë")).toBe(true);
        expect(matchesUserSearch("peyton smith", ...peyton)).toBe(false);
    });

    it("ranks exact and starts-with matches first", () => {
        expect(userSearchScore("peytongna", ...peyton)).toBe(0);
        expect(userSearchScore("pey", ...peyton)).toBe(1);
        expect(userSearchScore("gnad", ...peyton)).toBe(2);
        expect(userSearchScore("dinger", ...peyton)).toBe(3);
    });
});
