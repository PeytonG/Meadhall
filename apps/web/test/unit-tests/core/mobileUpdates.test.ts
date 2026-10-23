// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { compareVersions, parseRelease, RELEASES_PAGE } from "../../../src/core/updates/mobileUpdates";

describe("mobile update checks", () => {
    it("orders versions numerically, with pre-releases before releases", () => {
        expect(compareVersions("0.3.10", "0.3.9")).toBe(1);
        expect(compareVersions("v0.3.1", "0.3.1")).toBe(0);
        expect(compareVersions("0.4.0", "1.0.0")).toBe(-1);
        expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
    });

    it("finds the APK, preferring a release-signed one, and ignores drafts and pre-releases", () => {
        const release = {
            tag_name: "v0.3.1",
            html_url: "https://github.com/PeytonG/Meadhall/releases/tag/v0.3.1",
            assets: [
                { name: "Meadhall-0.3.1-android-debug-signed.apk", browser_download_url: "https://example/debug.apk" },
                { name: "Meadhall-0.3.1-android.apk", browser_download_url: "https://example/release.apk" },
                { name: "Meadhall-0.3.1.ipa", browser_download_url: "https://example/app.ipa" },
            ],
        };
        expect(parseRelease(release, "android")).toEqual({
            version: "0.3.1",
            pageUrl: "https://github.com/PeytonG/Meadhall/releases/tag/v0.3.1",
            downloadUrl: "https://example/release.apk",
        });
        expect(parseRelease(release, "ios")?.downloadUrl).toBe("https://example/app.ipa");
        expect(parseRelease({ ...release, draft: true }, "android")).toBeNull();
        expect(parseRelease({ ...release, prerelease: true }, "android")).toBeNull();
        expect(parseRelease({ ...release, html_url: "https://evil.example/" }, "android")?.pageUrl).toBe(RELEASES_PAGE);
    });
});
