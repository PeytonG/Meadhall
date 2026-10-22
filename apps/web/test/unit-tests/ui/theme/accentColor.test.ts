// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import {
    DEFAULT_ACCENT_COLOR,
    accentTokens,
    contrastRatio,
    hexToHsv,
    hsvToHex,
    normalizeHexColor,
} from "../../../../src/ui/theme/accentColor";

describe("accentColor", () => {
    it("normalizes hex input", () => {
        expect(normalizeHexColor("#A64DFF")).toBe("#a64dff");
        expect(normalizeHexColor("f0a")).toBe("#ff00aa");
        expect(normalizeHexColor("purple")).toBeNull();
        expect(normalizeHexColor(42)).toBeNull();
    });

    it("round-trips HSV", () => {
        expect(hsvToHex(0, 1, 1)).toBe("#ff0000");
        expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
        const { hue, saturation, value } = hexToHsv(DEFAULT_ACCENT_COLOR);
        expect(hsvToHex(hue, saturation, value)).toBe(DEFAULT_ACCENT_COLOR);
    });

    it("keeps any accent readable on both themes", () => {
        for (const accent of [DEFAULT_ACCENT_COLOR, "#000000", "#ffffff", "#ffff00", "#1a0040"]) {
            const dark = accentTokens(accent, "dark");
            const light = accentTokens(accent, "light");
            expect(contrastRatio(dark["--primary"], "#1a1b1e"), `${accent} on dark`).toBeGreaterThanOrEqual(3);
            expect(contrastRatio(light["--primary"], "#ffffff"), `${accent} on light`).toBeGreaterThanOrEqual(3);
            expect(contrastRatio(dark["--primary"], dark["--on-primary"]), `${accent} button text`).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(light["--primary"], light["--on-primary"]), `${accent} button text`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("leaves a readable accent untouched", () => {
        expect(accentTokens(DEFAULT_ACCENT_COLOR, "dark")["--primary"]).toBe(DEFAULT_ACCENT_COLOR);
        expect(accentTokens(DEFAULT_ACCENT_COLOR, "dark")["--primary-rgb"]).toBe("166, 77, 255");
    });
});
