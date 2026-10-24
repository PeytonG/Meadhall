// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { bytesToBase64, encodeMeadhallFile, parseMeadhallFile, parseShareSummary } from "../../../src/core/sharing/meadhallFile";

const audio = bytesToBase64(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]));

describe(".meadhall files", () => {
    it("round-trips a sound and a style profile", () => {
        const sound = { kind: "sound" as const, name: "Airhorn", emoji: "📯", mime: "audio/wav", audio };
        expect(parseMeadhallFile(encodeMeadhallFile(sound))).toEqual(sound);
        const style = { kind: "style" as const, name: "Midnight", appearance: { theme: "dark", accentColor: "#123abc", iconStyle: "smooth" as const, compactMode: true } };
        expect(parseMeadhallFile(encodeMeadhallFile(style))).toEqual(style);
    });

    it("only lets a style carry known appearance settings with safe values", () => {
        const parsed = parseMeadhallFile(
            JSON.stringify({
                format: "meadhall",
                version: 1,
                kind: "style",
                name: "Sneaky\u0007",
                appearance: {
                    theme: "dark",
                    accentColor: "red;background:url(evil)",
                    customFontFamily: "x; } body { display:none",
                    closeOnWindowCloseMinimize: true,
                    chatLineLengthCh: 9999,
                    notificationsEnabled: false,
                },
            }),
        );
        expect(parsed).toEqual({ kind: "style", name: "Sneaky", appearance: { theme: "dark", chatLineLengthCh: 200 } });
    });

    it("refuses things that aren't valid .meadhall files", () => {
        expect(() => parseMeadhallFile("not json")).toThrow(/isn't a \.meadhall file/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "other" }))).toThrow(/isn't a \.meadhall file/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 2, kind: "sound" }))).toThrow(/newer Meadhall/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 1, kind: "plugin" }))).toThrow(/doesn't know/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 1, kind: "sound", mime: "text/html", audio }))).toThrow(/format/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 1, kind: "sound", mime: "audio/wav", audio: "<script>" }))).toThrow(/too big or damaged/);
        const huge = "A".repeat(1.5 * 1024 * 1024);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 1, kind: "sound", mime: "audio/wav", audio: huge }))).toThrow(/too big/);
        expect(() => parseMeadhallFile(JSON.stringify({ format: "meadhall", version: 1, kind: "style", name: "x", appearance: { bogus: 1 } }))).toThrow(/empty/);
    });

    it("reads the summary shown on a chat card", () => {
        expect(parseShareSummary({ kind: "sound", name: "Airhorn", emoji: "📯" })).toEqual({ kind: "sound", name: "Airhorn", emoji: "📯" });
        expect(parseShareSummary({ kind: "script", name: "x" })).toBeNull();
    });
});
