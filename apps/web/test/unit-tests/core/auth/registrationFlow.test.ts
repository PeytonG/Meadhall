// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRegistrationTokenValidity, registrationTokenUsage } from "../../../../src/core/auth/registrationFlow";

describe("registrationTokenUsage", () => {
    it("is required when every flow needs a token (Synapse registration_requires_token)", () => {
        expect(registrationTokenUsage([{ stages: ["m.login.registration_token", "m.login.dummy"] }])).toBe("required");
    });

    it("is optional when another flow works without one", () => {
        expect(
            registrationTokenUsage([
                { stages: ["m.login.registration_token", "m.login.dummy"] },
                { stages: ["m.login.email.identity"] },
            ]),
        ).toBe("optional");
    });

    it("recognises the unstable stage name", () => {
        expect(registrationTokenUsage([{ stages: ["org.matrix.msc3231.login.registration_token"] }])).toBe("required");
    });

    it("is none for open registration", () => {
        expect(registrationTokenUsage([{ stages: ["m.login.dummy"] }])).toBe("none");
    });
});

describe("checkRegistrationTokenValidity", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("asks the validity endpoint with the token URL-encoded", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ valid: true }) }));
        vi.stubGlobal("fetch", fetchMock);
        await expect(checkRegistrationTokenValidity("https://hs.example", "a b&c")).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://hs.example/_matrix/client/v1/register/m.login.registration_token/validity?token=a%20b%26c",
        );
    });

    it("reports an invalid token", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ valid: false }) })));
        await expect(checkRegistrationTokenValidity("https://hs.example", "nope")).resolves.toBe(false);
    });

    it("returns null when the server can't answer", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
        await expect(checkRegistrationTokenValidity("https://hs.example", "x")).resolves.toBeNull();
        vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
        await expect(checkRegistrationTokenValidity("https://hs.example", "x")).resolves.toBeNull();
    });
});
