// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    CAMPFIRE_AVATAR_RADIUS,
    CAMPFIRE_CENTER_X,
    CAMPFIRE_CENTER_Y,
    CAMPFIRE_FRAMES,
    CAMPFIRE_GRID,
    campfireFrames,
    campfirePaths,
    flamePalette,
    normalizeFlameColor,
} from "../../../../src/ui/voice/campfire";
import { DEFAULT_FLAME_STYLE, parseFlameStyle } from "../../../../src/ui/voice/flameColor";

describe("pixel campfire", () => {
    const frames = campfireFrames();

    it("has flickering frames on a coarse pixel grid", () => {
        expect(frames).toHaveLength(CAMPFIRE_FRAMES);
        expect(frames[0]).toHaveLength(CAMPFIRE_GRID * CAMPFIRE_GRID);
        expect(frames[0]).not.toEqual(frames[1]);
    });

    it("only rises from the top of the avatar, never beside or below it (no text is covered)", () => {
        const left = CAMPFIRE_CENTER_X - CAMPFIRE_AVATAR_RADIUS;
        const right = CAMPFIRE_CENTER_X + CAMPFIRE_AVATAR_RADIUS;
        for (const frame of frames) {
            let flames = 0;
            frame.forEach((value, index) => {
                if (value === 0) return;
                flames += 1;
                const x = index % CAMPFIRE_GRID;
                const y = Math.floor(index / CAMPFIRE_GRID);
                expect(y).toBeLessThan(CAMPFIRE_CENTER_Y);
                expect(x).toBeGreaterThanOrEqual(Math.floor(left));
                expect(x).toBeLessThanOrEqual(Math.ceil(right));
                expect(Math.hypot(x - CAMPFIRE_CENTER_X, y - CAMPFIRE_CENTER_Y)).toBeGreaterThan(CAMPFIRE_AVATAR_RADIUS - 1);
            });
            expect(flames).toBeGreaterThan(10);
        }
    });

    it("draws one path per color", () => {
        const paths = campfirePaths(frames[0]);
        expect(paths[2]).toMatch(/^M\d+ \d+h1v1h-1z/);
        expect(paths).toHaveLength(4);
    });

    it("builds the palette from the chosen color", () => {
        expect(flamePalette("#a64dff")[1]).toBe("#a64dff");
        expect(flamePalette("not a color")[1]).toBe("#ff7a1a");
        expect(normalizeFlameColor("A64DFF")).toBe("#a64dff");
        expect(normalizeFlameColor("red")).toBeNull();
    });
});

describe("campfire profile setting", () => {
    it("defaults to an orange fire, on", () => {
        expect(parseFlameStyle(undefined)).toEqual(DEFAULT_FLAME_STYLE);
        expect(parseFlameStyle({ color: "#2ecc71" })).toEqual({ enabled: true, color: "#2ecc71" });
    });

    it("can be turned off (green ring) and ignores bad colors", () => {
        expect(parseFlameStyle({ enabled: false, color: "javascript:alert(1)" })).toEqual({
            enabled: false,
            color: DEFAULT_FLAME_STYLE.color,
        });
    });
});
