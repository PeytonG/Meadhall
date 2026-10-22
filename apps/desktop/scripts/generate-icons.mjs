// Generates the placeholder "M" (Meadhall) monogram icons in assets/ (app icon + tray icons).
// Run with: node scripts/generate-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "..", "assets");

const BACKGROUND = [0x10, 0x63, 0x28];
const FOREGROUND = [0xe6, 0xed, 0xf3];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

function distanceToSegment(x, y, [ax, ay], [bx, by]) {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
}

// Color of the rounded-square background and the "M" glyph at a point, in unit coordinates.
function sample(x, y) {
    const radius = 0.22;
    const dx = Math.max(radius - x, 0, x - (1 - radius));
    const dy = Math.max(radius - y, 0, y - (1 - radius));
    const inBackground = dx * dx + dy * dy <= radius * radius;
    if (!inBackground) {
        return null;
    }
    const halfStroke = 0.06;
    const inStem = y >= 0.25 && y <= 0.75 && ((x >= 0.24 && x <= 0.36) || (x >= 0.64 && x <= 0.76));
    const inDiagonal =
        y >= 0.25 &&
        (distanceToSegment(x, y, [0.31, 0.25], [0.5, 0.6]) <= halfStroke ||
            distanceToSegment(x, y, [0.69, 0.25], [0.5, 0.6]) <= halfStroke);
    return inStem || inDiagonal ? FOREGROUND : BACKGROUND;
}

function renderPng(size) {
    const supersample = 4;
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let py = 0; py < size; py += 1) {
        raw[py * (size * 4 + 1)] = 0;
        for (let px = 0; px < size; px += 1) {
            const sum = [0, 0, 0, 0];
            for (let sy = 0; sy < supersample; sy += 1) {
                for (let sx = 0; sx < supersample; sx += 1) {
                    const color = sample((px + (sx + 0.5) / supersample) / size, (py + (sy + 0.5) / supersample) / size);
                    if (color) {
                        sum[0] += color[0];
                        sum[1] += color[1];
                        sum[2] += color[2];
                        sum[3] += 255;
                    }
                }
            }
            const samples = supersample * supersample;
            const coverage = sum[3] / 255;
            const offset = py * (size * 4 + 1) + 1 + px * 4;
            raw[offset] = coverage ? Math.round(sum[0] / coverage) : 0;
            raw[offset + 1] = coverage ? Math.round(sum[1] / coverage) : 0;
            raw[offset + 2] = coverage ? Math.round(sum[2] / coverage) : 0;
            raw[offset + 3] = Math.round(sum[3] / samples);
        }
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

fs.mkdirSync(assetsDir, { recursive: true });
for (const [name, size] of [
    ["icon.png", 512],
    ["tray.png", 32],
    ["tray@2x.png", 64],
]) {
    fs.writeFileSync(path.join(assetsDir, name), renderPng(size));
    console.log(`wrote assets/${name} (${size}x${size})`);
}
