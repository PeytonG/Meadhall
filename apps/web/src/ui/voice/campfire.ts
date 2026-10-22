// SPDX-License-Identifier: AGPL-3.0-only
// The pixel campfire shown while someone talks: a small crown of pixel flames licking up from the top of their
// avatar. Flames only ever rise above the avatar and stay within its width, so they never cover names or text
// beside or below it. Each flame flickers through three sprite frames, out of step with its neighbours; CSS
// cycles the frames.

export const CAMPFIRE_GRID = 20;
// Avatar radius in grid cells: the avatar is 2 * radius / grid of the fire's width.
export const CAMPFIRE_AVATAR_RADIUS = 8;
export const CAMPFIRE_CENTER_X = 9.5;
// The avatar sits low in the box: only the strip above it holds flames.
export const CAMPFIRE_CENTER_Y = 13.5;
export const CAMPFIRE_FRAMES = 3;
// The flame color everyone gets until they pick their own.
export const DEFAULT_FLAME_COLOR = "#ff7a1a";

// Cell values: 0 empty, 1 dark flame edge, 2 the chosen color, 3 bright tip/core.
export type CampfireFrame = Uint8Array;

// Small flame sprites, bottom-aligned, three frames each. Digits are heat levels, "." is empty.
const FLAMES = [
    [
        [".1.", ".1.", "121", "121", "232"],
        ["..1", ".1.", ".21", "121", "232"],
        ["1..", ".1.", "12.", "121", "232"],
    ],
    [
        ["1..", "11.", "121", "232"],
        [".1.", "121", "121", "232"],
        ["..1", ".11", "121", "232"],
    ],
    [
        [".1.", ".1.", ".1.", "121", "122", "232"],
        ["..1", ".1.", ".21", "121", "221", "232"],
        ["...", "1..", ".1.", "121", "122", "232"],
    ],
];

// Angles (degrees from the top, clockwise) of the flames on the avatar's upper rim; the tallest in the middle.
const FLAME_ANGLES = [-52, -26, 0, 26, 52];

let cachedFrames: CampfireFrame[] | null = null;

export function campfireFrames(): CampfireFrame[] {
    if (cachedFrames) {
        return cachedFrames;
    }
    const size = CAMPFIRE_GRID;
    const left = Math.ceil(CAMPFIRE_CENTER_X - CAMPFIRE_AVATAR_RADIUS);
    const right = Math.floor(CAMPFIRE_CENTER_X + CAMPFIRE_AVATAR_RADIUS);
    const frames: CampfireFrame[] = [];
    for (let frame = 0; frame < CAMPFIRE_FRAMES; frame += 1) {
        const grid = new Uint8Array(size * size);
        FLAME_ANGLES.forEach((angle, flameIndex) => {
            const variants = FLAMES[flameIndex % FLAMES.length];
            const sprite = variants[(frame + flameIndex) % variants.length];
            const radians = (angle * Math.PI) / 180;
            // Base on the rim, tucked half a cell into the avatar so no gap shows between flame and picture.
            const baseX = Math.round(CAMPFIRE_CENTER_X + Math.sin(radians) * (CAMPFIRE_AVATAR_RADIUS - 1) - 1);
            const baseY = Math.round(CAMPFIRE_CENTER_Y - Math.cos(radians) * (CAMPFIRE_AVATAR_RADIUS - 0.5));
            sprite.forEach((row, rowIndex) => {
                const y = baseY - (sprite.length - 1 - rowIndex);
                for (let column = 0; column < row.length; column += 1) {
                    const value = row[column] === "." ? 0 : Number(row[column]);
                    const x = baseX + column;
                    // Only above the avatar's middle and within its width: never beside or below it.
                    if (value > 0 && x >= left && x <= right && y >= 0 && y < CAMPFIRE_CENTER_Y) {
                        const index = y * size + x;
                        grid[index] = Math.max(grid[index], value);
                    }
                }
            });
        });
        // The avatar covers the middle; nothing is drawn inside it.
        for (let index = 0; index < grid.length; index += 1) {
            const x = index % size;
            const y = Math.floor(index / size);
            if (Math.hypot(x + 0.5 - (CAMPFIRE_CENTER_X + 0.5), y + 0.5 - (CAMPFIRE_CENTER_Y + 0.5)) < CAMPFIRE_AVATAR_RADIUS - 0.3) {
                grid[index] = 0;
            }
        }
        frames.push(grid);
    }
    cachedFrames = frames;
    return frames;
}

// SVG path data per cell value for one frame (index = value): one path per color keeps the DOM small.
export function campfirePaths(frame: CampfireFrame): string[] {
    const paths = ["", "", "", ""];
    for (let index = 0; index < frame.length; index += 1) {
        const value = frame[index];
        if (value > 0) {
            paths[value] += `M${index % CAMPFIRE_GRID} ${Math.floor(index / CAMPFIRE_GRID)}h1v1h-1z`;
        }
    }
    return paths;
}

function parseHex(color: string): [number, number, number] | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (!match) {
        return null;
    }
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a: [number, number, number], b: [number, number, number], amount: number): string {
    const channel = (index: number): string =>
        Math.round(a[index] + (b[index] - a[index]) * amount)
            .toString(16)
            .padStart(2, "0");
    return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export function normalizeFlameColor(value: unknown): string | null {
    return typeof value === "string" && parseHex(value) ? `#${value.trim().replace(/^#/, "").toLowerCase()}` : null;
}

// Colors for cell values 1-3: a dark edge, the chosen color, and a light tip. Kept close together so the fire
// reads as a soft glow rather than a blaze.
export function flamePalette(color: string): [string, string, string] {
    const base = parseHex(color) ?? parseHex(DEFAULT_FLAME_COLOR)!;
    return [mix(base, [30, 8, 0], 0.4), mix(base, base, 0), mix(base, [255, 240, 170], 0.45)];
}
