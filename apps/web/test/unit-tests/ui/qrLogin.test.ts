// SPDX-License-Identifier: AGPL-3.0-only
import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { encodeQrPayload, parseQrPayload } from "../../../src/ui/auth/qrLogin";

// Draws a QR code as RGBA pixels (what a camera frame gives the scanner) and reads it back with jsQR.
function roundTrip(text: string): string | null {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const scale = 4;
    const margin = 4;
    const size = (qr.modules.size + margin * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < qr.modules.size; row += 1) {
        for (let col = 0; col < qr.modules.size; col += 1) {
            if (!qr.modules.get(row, col)) continue;
            for (let y = 0; y < scale; y += 1) {
                for (let x = 0; x < scale; x += 1) {
                    const offset = (((row + margin) * scale + y) * size + (col + margin) * scale + x) * 4;
                    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
                }
            }
        }
    }
    return jsQR(pixels, size, size)?.data ?? null;
}

describe("QR sign-in codes", () => {
    it("encode and parse back", () => {
        const text = encodeQrPayload({ homeserver: "https://matrix.example.org", token: "syl_AbCdEf123_456" });
        expect(parseQrPayload(text)).toEqual({ homeserver: "https://matrix.example.org", token: "syl_AbCdEf123_456" });
        expect(roundTrip(text)).toBe(text);
    });

    it("refuse anything that isn't a Meadhall code for an http(s) server", () => {
        expect(parseQrPayload("https://evil.example")).toBeNull();
        expect(parseQrPayload("meadhall-login:1?hs=javascript:alert(1)&t=abcdefghij")).toBeNull();
        expect(parseQrPayload("meadhall-login:1?hs=file:///etc/passwd&t=abcdefghij")).toBeNull();
        expect(parseQrPayload("meadhall-login:1?hs=https://user:pw@example.org&t=abcdefghij")).toBeNull();
        expect(parseQrPayload("meadhall-login:1?hs=https://example.org&t=short")).toBeNull();
        expect(parseQrPayload("meadhall-login:1?hs=https://example.org&t=has spaces in it")).toBeNull();
        expect(parseQrPayload(`meadhall-login:1?hs=https://example.org&t=${"a".repeat(3000)}`)).toBeNull();
    });
});
