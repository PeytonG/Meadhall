// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { ABOUT_KEY, BANNER_CROP_KEY, BANNER_KEY, EMAIL_KEY, LINKS_KEY, parseBannerCrop, parseRichProfile, safeLinkUrl } from "../../../src/core/profile/richProfile";

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
            bannerCrop: { x: 50, y: 50, zoom: 1 },
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

    it("reads the banner crop, clamped, with a centred default", () => {
        expect(parseRichProfile({ [BANNER_CROP_KEY]: { x: 20, y: 80, zoom: 2 } }).bannerCrop).toEqual({ x: 20, y: 80, zoom: 2 });
        expect(parseBannerCrop({ x: -5, y: 500, zoom: 99 })).toEqual({ x: 0, y: 100, zoom: 4 });
        expect(parseBannerCrop("nonsense")).toEqual({ x: 50, y: 50, zoom: 1 });
    });
});
