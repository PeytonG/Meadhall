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

    it("leaves the avatar uncovered and burns all around it", () => {
        for (const frame of frames) {
            let above = 0;
            let left = 0;
            let right = 0;
            frame.forEach((value, index) => {
                const x = index % CAMPFIRE_GRID;
                const y = Math.floor(index / CAMPFIRE_GRID);
                const inside = Math.hypot(x - CAMPFIRE_CENTER_X, y - CAMPFIRE_CENTER_Y) < CAMPFIRE_AVATAR_RADIUS - 1;
                if (inside) {
                    expect(value).toBe(0);
                }
                if (value >= 1 && value <= 4) {
                    if (y < CAMPFIRE_CENTER_Y - CAMPFIRE_AVATAR_RADIUS) above += 1;
                    if (x < CAMPFIRE_CENTER_X - CAMPFIRE_AVATAR_RADIUS) left += 1;
                    if (x > CAMPFIRE_CENTER_X + CAMPFIRE_AVATAR_RADIUS) right += 1;
                }
            });
            expect(above).toBeGreaterThan(0);
            expect(left).toBeGreaterThan(0);
            expect(right).toBeGreaterThan(0);
        }
    });

    it("draws one path per color", () => {
        const paths = campfirePaths(frames[0]);
        expect(paths[4]).toMatch(/^M\d+ \d+h1v1h-1z/);
        expect(paths[5]).not.toBe(""); // the logs
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
