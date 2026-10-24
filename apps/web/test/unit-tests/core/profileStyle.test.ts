// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { gradientColors, gradientCss, parseProfileStyle } from "../../../src/core/profile/profileStyle";

describe("profile style", () => {
    it("accepts presets and plain hex colors only", () => {
        expect(parseProfileStyle({ card: { preset: "aurora" }, nameplate: { colors: ["#FF0000", "#00ff00"] } })).toEqual({
            card: { preset: "aurora" },
            nameplate: { colors: ["#ff0000", "#00ff00"] },
        });
        // Anything that could inject CSS (or isn't a color) is dropped.
        expect(parseProfileStyle({ card: { colors: ["red; background: url(x)", "#000000"] }, nameplate: { preset: "nope" } })).toEqual({ card: null, nameplate: null });
        expect(parseProfileStyle("junk")).toEqual({ card: null, nameplate: null });
    });

    it("draws pixel gradients in hard bands and smooth ones normally", () => {
        const colors = gradientColors({ preset: "mead" })!;
        expect(gradientCss(colors, { pixel: false })).toBe("linear-gradient(160deg, #f5a623, #7a3b00)");
        const pixel = gradientCss(["#000000", "#ffffff"], { pixel: true, bands: 2, angle: 90 });
        expect(pixel).toBe("linear-gradient(90deg, #000000 0.00%, #000000 50.00%, #ffffff 50.00%, #ffffff 100.00%)");
    });
});
