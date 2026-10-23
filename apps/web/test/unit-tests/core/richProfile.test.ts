// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { ABOUT_KEY, BANNER_KEY, EMAIL_KEY, LINKS_KEY, parseRichProfile, safeLinkUrl } from "../../../src/core/profile/richProfile";

describe("rich profile", () => {
    it("only allows web links", () => {
        expect(safeLinkUrl("github.com/PeytonG")).toBe("https://github.com/PeytonG");
        expect(safeLinkUrl("http://example.org/a")).toBe("http://example.org/a");
        expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
        expect(safeLinkUrl("data:text/html,hi")).toBeNull();
        expect(safeLinkUrl("not a link")).toBeNull();
    });

    it("reads the fields and drops anything unsafe or malformed", () => {
        expect(
            parseRichProfile({
                [BANNER_KEY]: "mxc://example.org/banner",
                [ABOUT_KEY]: "Skald of the hall",
                [EMAIL_KEY]: "beowulf@example.org",
                [LINKS_KEY]: [
                    { label: "GitHub", url: "https://github.com/beowulf" },
                    { label: "Evil", url: "javascript:alert(1)" },
                    { url: "example.org/blog" },
                    "nonsense",
                ],
            }),
        ).toEqual({
            bannerMxc: "mxc://example.org/banner",
            about: "Skald of the hall",
            email: "beowulf@example.org",
            links: [
                { label: "GitHub", url: "https://github.com/beowulf" },
                { label: "example.org", url: "https://example.org/blog" },
            ],
        });
        expect(parseRichProfile({ [BANNER_KEY]: "https://evil.example/x.png", [EMAIL_KEY]: "nope" })).toMatchObject({
            bannerMxc: null,
            email: "",
        });
    });
});
