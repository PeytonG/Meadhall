// SPDX-License-Identifier: AGPL-3.0-only
// The pixel campfire shown around someone's avatar while they talk: chunky hand-drawn flame sprites standing on a
// ring around the avatar (big ones at the bottom and sides, small licks on top) over a pair of crossed logs. Each
// flame flickers through three sprite frames, out of step with its neighbours; CSS cycles the frames.

export const CAMPFIRE_GRID = 24;
// Avatar radius in grid cells: the avatar fills 2 * radius / grid of the fire's box.
export const CAMPFIRE_AVATAR_RADIUS = 7;
// The avatar sits a little low, leaving room for flames above it and the logs below.
export const CAMPFIRE_CENTER_X = 11.5;
export const CAMPFIRE_CENTER_Y = 12.5;
export const CAMPFIRE_FRAMES = 3;
// The flame color everyone gets until they pick their own.
export const DEFAULT_FLAME_COLOR = "#ff7a1a";

// Cell values: 0 empty, 1-4 flame from dark edge to white-hot core, 5-6 log (bark, cut end).
export type CampfireFrame = Uint8Array;
const LOG = 5;
const LOG_END = 6;

// Flame sprites, drawn bottom-aligned. Digits are heat levels, "." is empty.
const BIG_FLAME = [
    [
        "..1...",
        "..11..",
        ".121..",
        ".1221.",
        "12321.",
        "123321",
        "134431",
        ".1331.",
    ],
    [
        "...1..",
        "..11..",
        "..121.",
        ".1221.",
        ".12321",
        "123321",
        "134431",
        ".1331.",
    ],
    [
        "......",
        "..1...",
        ".121..",
        ".1221.",
        "122321",
        "123321",
        "134431",
        ".1331.",
    ],
];

const SMALL_FLAME = [
    [".1..", ".11.", "1221", "1331", ".11."],
    ["..1.", ".11.", "1221", "1331", ".11."],
    ["....", ".1..", "121.", "1331", ".11."],
];

// Where flames stand: angle around the avatar (0 = top, clockwise, degrees) and size.
const FLAMES: ReadonlyArray<{ angle: number; big: boolean }> = [
    { angle: 0, big: false },
    { angle: 38, big: false },
    { angle: -38, big: false },
    { angle: 75, big: true },
    { angle: -75, big: true },
    { angle: 112, big: true },
    { angle: -112, big: true },
    { angle: 150, big: true },
    { angle: -150, big: true },
];

function stamp(grid: Uint8Array, sprite: readonly string[], left: number, bottom: number): void {
    sprite.forEach((row, rowIndex) => {
        const y = bottom - (sprite.length - 1 - rowIndex);
        for (let column = 0; column < row.length; column += 1) {
            const value = row[column] === "." ? 0 : Number(row[column]);
            const x = left + column;
            if (value > 0 && x >= 0 && y >= 0 && x < CAMPFIRE_GRID && y < CAMPFIRE_GRID) {
                const index = y * CAMPFIRE_GRID + x;
                grid[index] = Math.max(grid[index], value);
            }
        }
    });
}

function drawLogs(grid: Uint8Array): void {
    // Two logs crossing in an X under the avatar, two cells thick, with lighter cut ends at the bottom.
    const length = 9;
    for (let step = 0; step < length; step += 1) {
        const y = CAMPFIRE_GRID - 1 - Math.floor(step / 2);
        for (const x of [5 + step, CAMPFIRE_GRID - 6 - step]) {
            for (const dx of [0, 1]) {
                const column = x + dx;
                if (y >= 0 && column >= 0 && column < CAMPFIRE_GRID) {
                    grid[y * CAMPFIRE_GRID + column] = step === 0 ? LOG_END : LOG;
                }
            }
        }
    }
}

let cachedFrames: CampfireFrame[] | null = null;

export function campfireFrames(): CampfireFrame[] {
    if (cachedFrames) {
        return cachedFrames;
    }
    const frames: CampfireFrame[] = [];
    for (let frame = 0; frame < CAMPFIRE_FRAMES; frame += 1) {
        const grid = new Uint8Array(CAMPFIRE_GRID * CAMPFIRE_GRID);
        drawLogs(grid);
        FLAMES.forEach(({ angle, big }, flameIndex) => {
            const sprites = big ? BIG_FLAME : SMALL_FLAME;
            const sprite = sprites[(frame + flameIndex) % sprites.length];
            const radians = (angle * Math.PI) / 180;
            // The flame's base sits on the avatar's edge, so its body rises past the avatar.
            const edgeX = CAMPFIRE_CENTER_X + Math.sin(radians) * (CAMPFIRE_AVATAR_RADIUS - 0.5);
            const edgeY = CAMPFIRE_CENTER_Y - Math.cos(radians) * (CAMPFIRE_AVATAR_RADIUS - 0.5);
            const width = sprite[0].length;
            stamp(grid, sprite, Math.round(edgeX - width / 2 + Math.sin(radians) * 1.5), Math.round(edgeY + (big ? 2 : 0)));
        });
        // The avatar covers the middle of the fire.
        for (let index = 0; index < grid.length; index += 1) {
            const x = index % CAMPFIRE_GRID;
            const y = Math.floor(index / CAMPFIRE_GRID);
            if (Math.hypot(x - CAMPFIRE_CENTER_X, y - CAMPFIRE_CENTER_Y) < CAMPFIRE_AVATAR_RADIUS - 0.2 && grid[index] <= 4) {
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
    const paths = ["", "", "", "", "", "", ""];
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

// Colors for cell values 1-6: dark flame edge, the chosen color, a bright version, a near-white core, then the
// logs' bark and cut ends (always wood-colored).
export function flamePalette(color: string): [string, string, string, string, string, string] {
    const base = parseHex(color) ?? parseHex(DEFAULT_FLAME_COLOR)!;
    return [
        mix(base, [40, 10, 0], 0.45),
        mix(base, base, 0),
        mix(base, [255, 236, 140], 0.5),
        mix(base, [255, 255, 235], 0.82),
        "#5a3418",
        "#c08a52",
    ];
}
