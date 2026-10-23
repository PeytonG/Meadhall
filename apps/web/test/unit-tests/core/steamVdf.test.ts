// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's Steam file parsing ("Playing ..."), tested here since the desktop package has no unit tests.
import { describe, expect, it } from "vitest";

import { gameNameFromManifest, libraryPathsFrom, parseVdf, runningAppIdFromRegistry } from "../../../../desktop/electron/vdf";

describe("Steam VDF files", () => {
    it("parses nested blocks, escapes and case-insensitive keys", () => {
        expect(parseVdf('"A" { "B" "1" "Path" "C:\\\\Games" "Inner" { "x" "y" } }')).toEqual({
            a: { b: "1", path: "C:\\Games", inner: { x: "y" } },
        });
    });

    it("finds the running game in registry.vdf (0 means none)", () => {
        const registry = (id: string) => `"Registry" { "HKCU" { "Software" { "Valve" { "Steam" { "RunningAppID" "${id}" } } } } }`;
        expect(runningAppIdFromRegistry(registry("413150"))).toBe("413150");
        expect(runningAppIdFromRegistry(registry("0"))).toBeNull();
        expect(runningAppIdFromRegistry("garbage")).toBeNull();
    });

    it("lists library folders (old and new formats) and reads game names", () => {
        expect(libraryPathsFrom('"libraryfolders" { "0" { "path" "/home/a/.steam" "apps" { "1" "2" } } "1" { "path" "/mnt/games" } }')).toEqual([
            "/home/a/.steam",
            "/mnt/games",
        ]);
        expect(libraryPathsFrom('"LibraryFolders" { "TimeNextStatsReport" "123" "1" "D:\\\\Steam" }')).toEqual(["D:\\Steam"]);
        expect(gameNameFromManifest('"AppState" { "appid" "413150" "name" "Stardew Valley" }')).toBe("Stardew Valley");
    });
});
