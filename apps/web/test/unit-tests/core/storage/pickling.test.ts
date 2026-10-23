// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { getPickleAdditionalData } from "../../../../src/core/storage/pickling";

// The previous implementation, kept here to prove the rewrite is byte-for-byte the same: existing pickle keys
// (and so every stored session) depend on it.
function legacy(userId: string, deviceId: string): Uint8Array {
    const data = new Uint8Array(userId.length + deviceId.length + 1);
    for (let index = 0; index < userId.length; index++) data[index] = userId.charCodeAt(index);
    data[userId.length] = 124;
    for (let index = 0; index < deviceId.length; index++) data[userId.length + 1 + index] = deviceId.charCodeAt(index);
    return data;
}

describe("pickle key additional data", () => {
    it("matches the previous format exactly, including non-ASCII IDs", () => {
        for (const [userId, deviceId] of [
            ["@alice:example.org", "ABCDEFGH"],
            ["@zoë:hall.example", "DEVICE"],
            ["@🍺:example.org", "ÄÖ"],
            ["", ""],
        ]) {
            expect(getPickleAdditionalData(userId, deviceId)).toEqual(legacy(userId, deviceId));
        }
    });
});
