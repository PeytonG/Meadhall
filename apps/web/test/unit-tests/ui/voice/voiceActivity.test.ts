// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { rmsLevel, SPEAKING_HOLD_MS, SPEAKING_RMS_THRESHOLD, SpeakingGate } from "../../../../src/ui/voice/voiceActivity";

describe("local speaking detection", () => {
    it("measures loudness as RMS", () => {
        expect(rmsLevel(new Float32Array([0, 0, 0]))).toBe(0);
        expect(rmsLevel(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    });

    it("lights up on the first loud frame and holds briefly between words", () => {
        const gate = new SpeakingGate();
        expect(gate.update(0.001, 0)).toBe(false);
        expect(gate.update(SPEAKING_RMS_THRESHOLD * 1.2, 50)).toBe(true);
        expect(gate.update(0, 50 + SPEAKING_HOLD_MS - 10)).toBe(true);
        expect(gate.update(0, 50 + SPEAKING_HOLD_MS + 10)).toBe(false);
    });

    it("is sensitive enough for quiet microphones", () => {
        // A quiet voice around -36 dBFS (RMS ~0.016) still counts as talking.
        expect(new SpeakingGate().update(0.016, 0)).toBe(true);
    });
});
