// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from "vitest";

import { beginCallLog, currentCallLogId, logCallEvent, readCallLog } from "../../../../src/ui/voice/callLog";

beforeEach(() => window.localStorage.clear());

describe("call history per call", () => {
    it("shows only the current call in the call view, and everything in Logs", () => {
        const first = beginCallLog();
        logCallEvent("Connected", "!a:x");
        logCallEvent("Dropped by the network or call server", "signal close");
        logCallEvent("Rejoining", "attempt 1");
        const second = beginCallLog();
        logCallEvent("Connected", "!b:x");

        expect(currentCallLogId()).toBe(second);
        expect(readCallLog(second).map((entry) => entry.event)).toEqual(["Connected"]);
        expect(readCallLog(first)).toHaveLength(3);
        expect(readCallLog()).toHaveLength(4);
        expect(readCallLog(null)).toEqual([]);
    });
});
