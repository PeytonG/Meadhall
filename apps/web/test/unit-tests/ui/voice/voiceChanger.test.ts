// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { normalizeVoiceEffect, pitchFactorFor, VOICE_EFFECTS } from "../../../../src/ui/voice/voiceChanger";

// The audio itself is checked in Chromium (pitch measured: 220 Hz -> Giant 160, Pixie 331, Troll 122).
describe("voice changer presets", () => {
    it("falls back to off for unknown or missing effects", () => {
        expect(normalizeVoiceEffect("giant")).toBe("giant");
        expect(normalizeVoiceEffect("chipmunk-9000")).toBe("off");
        expect(normalizeVoiceEffect(undefined)).toBe("off");
    });

    it("pitches giant and troll down and pixie up", () => {
        expect(pitchFactorFor("giant")).toBeLessThan(1);
        expect(pitchFactorFor("troll")).toBeLessThan(pitchFactorFor("giant"));
        expect(pitchFactorFor("pixie")).toBeGreaterThan(1);
        expect(pitchFactorFor("robot")).toBe(1);
    });

    it("offers Off first", () => {
        expect(VOICE_EFFECTS[0]?.id).toBe("off");
    });
});
