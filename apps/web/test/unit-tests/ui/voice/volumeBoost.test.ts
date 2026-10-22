// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { boostGainFor, setElementVolumePercent } from "../../../../src/ui/voice/volumeBoost";

describe("participant volume boost", () => {
    it("only boosts above 100%", () => {
        expect(boostGainFor(50)).toBe(1);
        expect(boostGainFor(100)).toBe(1);
        expect(boostGainFor(120)).toBeCloseTo(1.2);
    });

    it("uses the element volume up to 100%", () => {
        const element = document.createElement("audio");
        setElementVolumePercent(element, 80);
        expect(element.volume).toBeCloseTo(0.8);
    });

    it("plays at full volume when Web Audio can't boost (no stream or no AudioContext)", () => {
        const element = document.createElement("audio");
        setElementVolumePercent(element, 120);
        expect(element.volume).toBe(1);
        setElementVolumePercent(element, 60);
        expect(element.volume).toBeCloseTo(0.6);
    });
});
