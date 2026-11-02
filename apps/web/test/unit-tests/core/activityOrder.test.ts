// SPDX-License-Identifier: AGPL-3.0-only
// "Playing …" follows the game you started last, and drops a game whose process quit, even when something (a
// launcher keeping its Rich Presence connection open, Steam's stale running-game record) still reports it.
import { describe, expect, it } from "vitest";

import { newestFirst, type DesktopActivity } from "../../../../desktop/electron/activity/index";

const game = (name: string, source: DesktopActivity["source"] = "game"): DesktopActivity => ({ source, kind: "playing", name });

describe("activity order", () => {
    it("puts the game started last first, whatever reports the older one", () => {
        expect(newestFirst([game("Valheim", "rpc")], 1_000).map((activity) => activity.name)).toEqual(["Valheim"]);
        // Valheim's launcher still reports it; Hades was just started.
        const later = newestFirst([game("Valheim", "rpc"), game("Hades")], 2_000);
        expect(later.map((activity) => activity.name)).toEqual(["Hades", "Valheim"]);
    });

    it("keeps one entry per game, preferring the source with details, and puts music last", () => {
        const list = newestFirst(
            [
                { source: "media", kind: "listening", name: "Skyrim Theme" },
                { ...game("Celeste", "rpc"), details: "Chapter 3" },
                game("Celeste", "steam"),
            ],
            5_000,
        );
        expect(list.map((activity) => [activity.source, activity.name])).toEqual([
            ["rpc", "Celeste"],
            ["media", "Skyrim Theme"],
        ]);
    });

    it("starts a game's clock again when it comes back after closing", () => {
        newestFirst([game("Portal"), game("Doom")], 10_000);
        newestFirst([game("Doom")], 11_000);
        // Portal was closed and reopened: now newer than Doom.
        expect(newestFirst([game("Doom"), game("Portal")], 12_000)[0]!.name).toBe("Portal");
    });
});
