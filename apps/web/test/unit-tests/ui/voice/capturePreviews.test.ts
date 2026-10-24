// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { mergeCapturePreviews } from "../../../../src/ui/voice/capturePreviews";

describe("screen share previews", () => {
    it("fill into the open picker in its order, keeping what was there", () => {
        const quick = [
            { id: "screen:1", name: "Screen 1", kind: "screen" as const, thumbnail: null, icon: null },
            { id: "window:2", name: "Game", kind: "window" as const, thumbnail: null, icon: "data:icon" },
            { id: "window:3", name: "Closed meanwhile", kind: "window" as const, thumbnail: null, icon: null },
        ];
        const previews = [
            { id: "window:2", name: "Game", kind: "window" as const, thumbnail: "data:game", icon: null },
            { id: "screen:1", name: "Screen 1", kind: "screen" as const, thumbnail: "data:screen", icon: null },
            { id: "window:9", name: "Opened meanwhile", kind: "window" as const, thumbnail: "data:new", icon: null },
        ];
        expect(mergeCapturePreviews(quick, previews)).toEqual([
            { ...quick[0], thumbnail: "data:screen" },
            { ...quick[1], thumbnail: "data:game", icon: "data:icon" },
            quick[2],
        ]);
    });
});
