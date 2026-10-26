// SPDX-License-Identifier: AGPL-3.0-only
// Activity: the desktop app's Rich Presence / game list / MPRIS parsing, and what gets shared (tested here since
// the desktop package has no unit tests).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { matchProcess, resetDetectableForTests } from "../../../../desktop/electron/activity/detectable";
import { detectedFrom } from "../../../../desktop/electron/activity/gameDetection";
import { parseMetadata, parsePlayerNames, parsePlayerctl } from "../../../../desktop/electron/activity/media";
import { activityFromRpc } from "../../../../desktop/electron/activity/richPresence";
import {
    DEFAULT_ACTIVITY_SETTINGS,
    activityText,
    isHidden,
    normalizeActivitySettings,
    parseSharedActivity,
    pickActivity,
    type DetectedActivity,
} from "../../../src/ui/presence/activitySharing";

let dir = "";
beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadhall-detectable-"));
    const db = [
        { id: "111111111111", name: "Pixel Quest", executables: [{ name: "pixelquest.exe" }, { name: "pixel_launcher.exe", is_launcher: true }] },
        { id: "222222222222", name: "Deep Game", executables: [{ name: "bin/x64/game.exe" }] },
        { id: "333333333333", name: "Exact One", executables: [{ name: ">exact" }] },
    ];
    fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(db));
    process.env.MEADHALL_DETECTABLE_DB = path.join(dir, "db.json");
    resetDetectableForTests();
});
afterAll(() => {
    delete process.env.MEADHALL_DETECTABLE_DB;
    resetDetectableForTests();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("game detection", () => {
    it("matches the database's executables like arRPC does, not launchers or look-alikes", () => {
        expect(matchProcess("C:\\Games\\PixelQuest\\PixelQuest.exe")?.name).toBe("Pixel Quest");
        expect(matchProcess("C:\\Games\\Deep\\bin\\x64\\game.exe")?.name).toBe("Deep Game");
        // Another program that happens to be called game.exe.
        expect(matchProcess("C:\\Tools\\game.exe")).toBeNull();
        expect(matchProcess("C:\\Games\\pixel_launcher.exe")).toBeNull();
        expect(matchProcess("/usr/bin/exact")?.name).toBe("Exact One");
    });

    it("keeps a game's start time while it runs", () => {
        const first = detectedFrom([{ path: "D:/x/pixelquest.exe", args: [] }], 1000);
        const again = detectedFrom([{ path: "D:/x/pixelquest.exe", args: [] }], 9000);
        expect(first[0]).toMatchObject({ name: "Pixel Quest", startedAt: 1000 });
        expect(again[0]!.startedAt).toBe(1000);
        expect(detectedFrom([], 10_000)).toEqual([]);
        expect(detectedFrom([{ path: "D:/x/pixelquest.exe", args: [] }], 20_000)[0]!.startedAt).toBe(20_000);
    });
});

describe("Rich Presence", () => {
    it("names the app from the local list, and reads details, kind and start time", () => {
        expect(activityFromRpc("111111111111", { details: "In a match", state: "3 of 5", type: 0, timestamps: { start: 1_700_000_000 } }, 5)).toEqual({
            appId: "111111111111",
            name: "Pixel Quest",
            kind: "playing",
            details: "In a match",
            state: "3 of 5",
            startedAt: 1_700_000_000_000,
            updatedAt: 5,
        });
        expect(activityFromRpc("999999999999", { details: "Editing main.ts", type: 0 })?.name).toBe("Editing main.ts");
        expect(activityFromRpc("999999999999", { details: "Song", state: "Artist", type: 2 })).toMatchObject({ name: "Song", kind: "listening", state: "Artist", details: undefined });
    });

    it("drops junk: nothing to show, control and direction-override characters, overlong text", () => {
        expect(activityFromRpc("999999999999", {})).toBeNull();
        expect(activityFromRpc("999999999999", null)).toBeNull();
        const sneaky = activityFromRpc("999999999999", { details: "a\u202ebad\u0007" + "x".repeat(300) });
        expect(sneaky?.name.startsWith("abad")).toBe(true);
        expect(sneaky?.name.length).toBe(128);
    });
});

describe("Linux media (MPRIS)", () => {
    it("reads playerctl", () => {
        expect(parsePlayerctl("Paused\tvlc\t\tSomething\nPlaying\tspotify\tDaft Punk\tAround the World\n")).toEqual({ player: "spotify", title: "Around the World", artist: "Daft Punk" });
        expect(parsePlayerctl("Paused\tvlc\t\tSomething\n")).toBeNull();
    });

    it("reads dbus-send replies", () => {
        expect(parsePlayerNames('array [\n string "org.freedesktop.DBus"\n string "org.mpris.MediaPlayer2.spotify"\n string ":1.4"\n]')).toEqual(["org.mpris.MediaPlayer2.spotify"]);
        const reply = `variant       array [
         dict entry(
            string "xesam:artist"
            variant                array [
                  string "Daft Punk"
                  string "Someone"
               ]
         )
         dict entry(
            string "xesam:title"
            variant                string "Around the World"
         )
      ]`;
        expect(parseMetadata(reply)).toEqual({ title: "Around the World", artist: "Daft Punk, Someone" });
    });
});

describe("what gets shared", () => {
    const detected: DetectedActivity[] = [
        { source: "rpc", kind: "playing", name: "Pixel Quest", details: "In a match", state: "3 of 5", appId: "111111111111" },
        { source: "steam", kind: "playing", name: "Stardew Valley", appId: "413150" },
    ];

    it("defaults to people you share a chat with, name only, Steam on and the rest off", () => {
        expect(normalizeActivitySettings(undefined)).toEqual(DEFAULT_ACTIVITY_SETTINGS);
        expect(DEFAULT_ACTIVITY_SETTINGS).toMatchObject({ audience: "contacts", steam: true, richPresence: false, games: false, media: false, showDetails: false });
        expect(normalizeActivitySettings({ audience: "the world", hidden: ["a", "a", 3, " b "] })).toMatchObject({ audience: "contacts", hidden: ["a", "b"] });
    });

    it("shares the first thing that isn't hidden; details only when allowed", () => {
        const plain = pickActivity(detected, DEFAULT_ACTIVITY_SETTINGS, null, 100);
        expect(plain).toEqual({ name: "Pixel Quest", kind: "playing", since: 100 });
        expect(activityText(plain!)).toBe("Playing Pixel Quest");
        const detailed = pickActivity(detected, { ...DEFAULT_ACTIVITY_SETTINGS, showDetails: true }, null, 100);
        expect(activityText(detailed!)).toBe("Playing Pixel Quest · In a match · 3 of 5");
        expect(pickActivity(detected, { ...DEFAULT_ACTIVITY_SETTINGS, hidden: ["pixel quest"] }, null)?.name).toBe("Stardew Valley");
        // Hidden by app id too.
        expect(isHidden(detected[1]!, ["413150"])).toBe(true);
        expect(pickActivity(detected, { ...DEFAULT_ACTIVITY_SETTINGS, hidden: ["Pixel Quest", "Stardew Valley"] }, null)).toBeNull();
        // "since" stays while it's the same thing.
        expect(pickActivity(detected, DEFAULT_ACTIVITY_SETTINGS, { name: "Pixel Quest", kind: "playing", since: 5 }, 100)?.since).toBe(5);
        expect(activityText({ name: "Song", kind: "listening", since: 0 })).toBe("Listening to Song");
    });

    it("reads activity others share, rejecting junk", () => {
        expect(parseSharedActivity({ name: " Game ", since: 3, kind: "watching", details: "x" })).toEqual({ name: "Game", since: 3, kind: "watching", details: "x" });
        expect(parseSharedActivity({ name: "Game", kind: "hacking" })).toEqual({ name: "Game", since: 0, kind: "playing" });
        expect(parseSharedActivity({ name: "" })).toBeNull();
        expect(parseSharedActivity("Game")).toBeNull();
    });
});
