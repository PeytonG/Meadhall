// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeHomeserverUrl, resolveHomeserverBaseUrl } from "../../../../src/core/auth/loginFlow";

type FakeResponse = { ok: boolean; url: string; json: () => Promise<unknown> };

function stubFetch(routes: Record<string, FakeResponse | "network-error">): void {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            const route = routes[url];
            if (!route || route === "network-error") {
                throw new TypeError("Failed to fetch");
            }
            return route;
        }),
    );
}

function okJson(url: string, body: unknown): FakeResponse {
    return { ok: true, url, json: async () => body };
}

describe("normalizeHomeserverUrl", () => {
    it("adds https:// to a bare domain and strips the trailing slash", () => {
        expect(normalizeHomeserverUrl(" example.org/ ")).toBe("https://example.org");
    });
});

describe("resolveHomeserverBaseUrl", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("follows .well-known delegation to the real homeserver", async () => {
        stubFetch({
            "https://example.org/.well-known/matrix/client": okJson("https://example.org/.well-known/matrix/client", {
                "m.homeserver": { base_url: "https://matrix.example.org/" },
            }),
        });
        await expect(resolveHomeserverBaseUrl("https://example.org")).resolves.toBe("https://matrix.example.org");
    });

    it("uses the redirected address when http:// redirects to https://", async () => {
        stubFetch({
            "http://example.org/.well-known/matrix/client": "network-error",
            "http://example.org/_matrix/client/versions": okJson("https://example.org/_matrix/client/versions", {
                versions: ["v1.11"],
            }),
        });
        await expect(resolveHomeserverBaseUrl("http://example.org")).resolves.toBe("https://example.org");
    });

    it("ignores a .well-known without a usable base_url", async () => {
        stubFetch({
            "https://example.org/.well-known/matrix/client": okJson("https://example.org/.well-known/matrix/client", {
                "m.homeserver": { base_url: "javascript:alert(1)" },
            }),
            "https://example.org/_matrix/client/versions": okJson("https://example.org/_matrix/client/versions", {}),
        });
        await expect(resolveHomeserverBaseUrl("https://example.org")).resolves.toBe("https://example.org");
    });

    it("returns the entered address when the server can't be reached", async () => {
        stubFetch({});
        await expect(resolveHomeserverBaseUrl("https://unreachable.example")).resolves.toBe("https://unreachable.example");
    });
});
