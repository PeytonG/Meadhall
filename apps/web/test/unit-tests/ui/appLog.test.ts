// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from "vitest";

import { clearAppLog, hintFor, logAppError, readAppLog, redactSecrets } from "../../../src/ui/logs/appLog";

describe("error log", () => {
    beforeEach(() => clearAppLog());

    it("keeps errors with their source, merging quick repeats", () => {
        logAppError("call", new Error("Lost the call connection (signal close)."));
        logAppError("call", new Error("Lost the call connection (signal close)."));
        logAppError("updates", "Couldn't check for updates: net::ERR_INTERNET_DISCONNECTED");
        expect(readAppLog().map((entry) => [entry.source, entry.message])).toEqual([
            ["call", "Lost the call connection (signal close)."],
            ["updates", "Couldn't check for updates: net::ERR_INTERNET_DISCONNECTED"],
        ]);
    });

    it("explains common errors", () => {
        expect(hintFor("M_LIMIT_EXCEEDED: Too many requests")).toMatch(/limiting/);
        expect(hintFor("TypeError: Failed to fetch")).toMatch(/internet connection/);
        expect(hintFor("Command pkexec exited with code 127")).toMatch(/Linux/);
        expect(hintFor("startVerification(): other device is unknown")).toMatch(/both devices/);
        expect(hintFor("Lost the call connection (signal close).")).toMatch(/call server/);
        expect(hintFor("something nobody has seen")).toBeNull();
    });
});

describe("redactSecrets", () => {
    it("removes access tokens and passwords before they're logged", () => {
        expect(redactSecrets("GET /sync?access_token=syt_abc123def456ghi failed")).toBe("GET /sync?access_token=[redacted] failed");
        expect(redactSecrets("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [redacted]");
        expect(redactSecrets('{"password":"hunter22"}')).toBe('{"password":"[redacted]"}');
        expect(redactSecrets("token syt_YWxpY2U_abcdefghij_123 rejected")).toBe("token [redacted] rejected");
        expect(redactSecrets("Rate limited: retry after 3s")).toBe("Rate limited: retry after 3s");
    });
});
