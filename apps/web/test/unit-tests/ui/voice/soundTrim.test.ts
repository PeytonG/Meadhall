// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";

import { clampSelection, encodeWav, initialSelection, waveformPeaks } from "../../../../src/ui/voice/soundboard/trim";

describe("trimming soundboard sounds", () => {
    it("starts with the whole sound, or its first 8 seconds", () => {
        expect(initialSelection(3)).toEqual({ start: 0, end: 3 });
        expect(initialSelection(42)).toEqual({ start: 0, end: 8 });
    });

    it("keeps the selection inside the sound, 0.2-8 seconds long, moving the other handle when needed", () => {
        expect(clampSelection({ start: 5, end: 20 }, 30, "end")).toEqual({ start: 12, end: 20 });
        expect(clampSelection({ start: 10, end: 12 }, 30, "start")).toEqual({ start: 10, end: 12 });
        expect(clampSelection({ start: 2, end: 30 }, 30, "start")).toEqual({ start: 2, end: 10 });
        expect(clampSelection({ start: 4, end: 4 }, 30, "end")).toEqual({ start: 3.8, end: 4 });
        expect(clampSelection({ start: -3, end: 50 }, 6, "end")).toEqual({ start: 0, end: 6 });
    });

    it("finds peaks for the waveform", () => {
        expect(waveformPeaks(new Float32Array([0.1, -0.9, 0.2, 0.3, -0.4, 0.05]), 3)).toEqual([
            expect.closeTo(0.9),
            expect.closeTo(0.3),
            expect.closeTo(0.4),
        ]);
    });

    it("writes a valid mono 16-bit WAV", () => {
        const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 24_000);
        const view = new DataView(wav.buffer);
        expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
        expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(24_000);
        expect(view.getUint32(40, true)).toBe(8);
        expect(view.getInt16(46, true)).toBe(32767);
        expect(view.getInt16(48, true)).toBe(-32768);
        expect(wav.length).toBe(44 + 8);
    });
});
