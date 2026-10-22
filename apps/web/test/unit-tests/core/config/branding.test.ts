import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND, getBrandName, getDeviceDisplayName } from "../../../../src/core/config/branding";
import { DEFAULT_CORE_CONFIG } from "../../../../src/core/config/defaultConfig";

describe("branding", () => {
    it("defaults to Meadhall", () => {
        expect(DEFAULT_BRAND).toBe("Meadhall");
        expect(DEFAULT_CORE_CONFIG.brand).toBe("Meadhall");
        expect(getBrandName(null)).toBe("Meadhall");
        expect(getBrandName({ brand: "   " })).toBe("Meadhall");
    });

    it("uses the configured brand", () => {
        expect(getBrandName({ brand: " Example Chat " })).toBe("Example Chat");
    });

    it("names devices after the brand and runtime", () => {
        expect(getDeviceDisplayName(null, false)).toBe("Meadhall Web");
        expect(getDeviceDisplayName({ brand: "Example Chat" }, true)).toBe("Example Chat Desktop");
    });
});
