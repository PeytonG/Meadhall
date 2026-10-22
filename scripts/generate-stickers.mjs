// SPDX-License-Identifier: AGPL-3.0-only
// Renders Meadhall's pixel-art sticker pack from the 16x16 sprites below into
// apps/web/src/ui/assets/stickers/<id>.png (8x scale, nearest neighbour) plus docs/stickers-sheet.png for review.
// Run with: node scripts/generate-stickers.mjs   (outputs are committed; rerun after editing a sprite)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "apps/web/src/ui/assets/stickers");
const SCALE = 8;

// Shared palette. "." is transparent.
const PALETTE = {
    o: "#1d1120", // outline
    w: "#fff6e0", // highlight / foam
    W: "#d8c8a0", // foam shade
    y: "#f2b33d", // mead / gold
    Y: "#b8761c", // gold shade
    b: "#8a5a2b", // wood
    B: "#5a3a1c", // wood shade
    g: "#c9cbd6", // steel
    G: "#7c7f93", // steel shade
    r: "#e8434f", // red
    R: "#9e1f33", // red shade
    p: "#a64dff", // Meadhall purple
    P: "#6b25b8", // purple shade
    f: "#ff8a2b", // flame orange
    F: "#ffd34d", // flame yellow
    s: "#f1c9a5", // skin
    S: "#c9946c", // skin shade
    k: "#ffffff", // white
    n: "#3d7bd9", // blue
    N: "#24489a", // blue shade
};

// Each sprite: 16 rows of 16 characters.
const SPRITES = {
    cheers: {
        name: "Cheers",
        rows: [
            "................",
            "...wwwwwww......",
            "..wwkwwwwWw.....",
            "..oWWWWWWWWo....",
            "..oyyyyyyyyooo..",
            "..oyYyyyyyyo.o..",
            "..oyYyyyyyyo.o..",
            "..oggggggggo.o..",
            "..oyYyyyyyyo.o..",
            "..oyYyyyyyyo.o..",
            "..oyYyyyyyyooo..",
            "..oggggggggo....",
            "..oyYyyyyyyo....",
            "..oYYYYYYYYo....",
            "...oooooooo.....",
            "................",
        ],
    },
    heart: {
        name: "Heart",
        rows: [
            "................",
            "................",
            "..ooo....ooo....",
            ".orrro..orrro...",
            "orkrrroorrrrro..",
            "orkrrrrrrrrrro..",
            "orrrrrrrrrrrRo..",
            "orrrrrrrrrrrRo..",
            ".orrrrrrrrrRo...",
            "..orrrrrrrRo....",
            "...orrrrrRo.....",
            "....orrrRo......",
            ".....orRo.......",
            "......oo........",
            "................",
            "................",
        ],
    },
    crown: {
        name: "Crown",
        rows: [
            "................",
            "................",
            "..o....o....o...",
            ".oyo..oyo..oyo..",
            ".oyo..oyo..oyo..",
            ".oyyooyyyooyyo..",
            ".oyyyyyyyyyyyo..",
            ".oyyyyyryyyyyo..",
            ".oyyyyrrryyyyo..",
            ".oyyyyyryyyyyo..",
            ".oYYYYYYYYYYYo..",
            ".opYYpYYpYYpYo..",
            ".oYYYYYYYYYYYo..",
            "..ooooooooooo...",
            "................",
            "................",
        ],
    },
    shield: {
        name: "Shield",
        rows: [
            "................",
            "..oooooooooooo..",
            "..ogppppppppgo..",
            "..ogpkpppppPgo..",
            "..ogpppyypPPgo..",
            "..ogppyyyyPPgo..",
            "..ogppyyyyPPgo..",
            "..ogpppyypPPgo..",
            "..ogppppppPPgo..",
            "...ogpppppPgo...",
            "...ogpppppPgo...",
            "....ogpppPgo....",
            ".....ogpPgo.....",
            "......oggo......",
            ".......oo.......",
            "................",
        ],
    },
    sword: {
        name: "Sword",
        rows: [
            "............ooo.",
            "...........okgo.",
            "..........okgGo.",
            ".........okgGo..",
            "........okgGo...",
            ".......okgGo....",
            "......okgGo.....",
            "..oo.okgGo......",
            "..oyookgGo......",
            "...oyyoGo.......",
            "....oyyo........",
            "...obbyyo.......",
            "..obBo.oyo......",
            ".obBo...oo......",
            ".ooo............",
            "................",
        ],
    },
    fire: {
        name: "Fire",
        rows: [
            "................",
            ".......o........",
            "......ofo.......",
            "......ofo..o....",
            ".....offfoofo...",
            "....offFfooffo..",
            "...offFFfofffo..",
            "...ofFFFfffffo..",
            "..offFFkFFfffo..",
            "..offFkkFFffffo.",
            "..offFFkFFFfffo.",
            "..offfFFFFFffro.",
            "...offfFFfffro..",
            "....orrfffrro...",
            ".....ooooooo....",
            "................",
        ],
    },
    coin: {
        name: "Gold",
        rows: [
            "................",
            ".....oooooo.....",
            "...ooyyyyyyoo...",
            "..oyywyyyyyyYo..",
            "..oywyyyyyyyYo..",
            ".oyyyyYYYYyyyYo.",
            ".oyyyYyyyyYyyYo.",
            ".oyyyYyyyyyyyYo.",
            ".oyyyYyyyyyyyYo.",
            ".oyyyYyyyyYyyYo.",
            ".oyyyyYYYYyyyYo.",
            "..oyyyyyyyyyYo..",
            "..oYyyyyyyyYYo..",
            "...ooYYYYYYoo...",
            ".....oooooo.....",
            "................",
        ],
    },
    gg: {
        name: "GG",
        rows: [
            "................",
            "................",
            ".oooooo.oooooo..",
            "oppppppooppppppo",
            "oppPPPpooppPPPpo",
            "oppoooo.oppoooo.",
            "oppoppo.oppoppo.",
            "oppoppppoppopppo",
            "oppooppooppooppo",
            "opppppPoopppppPo",
            ".oPPPPo..oPPPPo.",
            "..oooo....oooo..",
            "................",
            "................",
            "................",
            "................",
        ],
    },
    thumbs_up: {
        name: "Thumbs up",
        rows: [
            "................",
            "......oo........",
            ".....osso.......",
            ".....osso.......",
            "....ossso.......",
            "....ossooooooo..",
            ".oooosssssssso..",
            ".onnosssssSsso..",
            ".onnoosssssooo..",
            ".onnossssssSso..",
            ".onnoosssssooo..",
            ".onnosssssssSo..",
            ".oNNoosssssoo...",
            ".ooooooooooo....",
            "................",
            "................",
        ],
    },
    lol: {
        name: "LOL",
        rows: [
            "................",
            ".....oooooo.....",
            "...ooyyyyyyoo...",
            "..oyyyyyyyyyyo..",
            ".oyyooyyyyooyyo.",
            ".oyonyyyyyynoyo.",
            ".oyyyyyyyyyyyyo.",
            ".oyoooooooooYyo.",
            ".oyorkkkkkkroYo.",
            ".oyorrrrrrrroYo.",
            ".oyyorrrrrroyYo.",
            "..oyyoooooooYo..",
            "...ooyyyyyYoo...",
            ".....oooooo.....",
            "................",
            "................",
        ],
    },
    skull: {
        name: "RIP",
        rows: [
            "................",
            ".....oooooo.....",
            "...ookkkkkkoo...",
            "..okkkkkkkkkWo..",
            "..okkkkkkkkkWo..",
            ".okooookkoooWWo.",
            ".okooookkoooWWo.",
            ".okooookkoooWWo.",
            ".okkkkkookkkkWo.",
            "..okkkkoookkWo..",
            "...okkkkkkkWo...",
            "...okoWoWokWo...",
            "...okoWoWoWWo...",
            "....oooooooo....",
            "................",
            "................",
        ],
    },
    sparkles: {
        name: "Wow",
        rows: [
            "................",
            "....o...........",
            "...oyo......o...",
            "..oyFyo....oyo..",
            ".oyFkFyo..oyFyo.",
            "..oyFyo....oyo..",
            "...oyo......o...",
            "....o...........",
            "...........o....",
            "..o.......oyo...",
            ".oyo.....oyFyo..",
            "..o.....oyFkFyo.",
            ".........oyFyo..",
            "..........oyo...",
            "...........o....",
            "................",
        ],
    },
};

function toRgba(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

async function renderSprite(id, { rows }) {
    if (rows.length !== 16 || rows.some((row) => row.length !== 16)) {
        throw new Error(`Sticker "${id}" must be 16 rows of 16 characters (rows: ${rows.map((row) => row.length).join(",")})`);
    }
    const pixels = Buffer.alloc(16 * 16 * 4);
    rows.forEach((row, y) =>
        [...row].forEach((char, x) => {
            if (char === ".") return;
            const hex = PALETTE[char];
            if (!hex) throw new Error(`Sticker "${id}" uses unknown color "${char}" at ${x},${y}`);
            pixels.set(toRgba(hex), (y * 16 + x) * 4);
        }),
    );
    return sharp(pixels, { raw: { width: 16, height: 16, channels: 4 } })
        .resize(16 * SCALE, 16 * SCALE, { kernel: "nearest" })
        .png({ compressionLevel: 9 })
        .toBuffer();
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const rendered = [];
for (const [id, sprite] of Object.entries(SPRITES)) {
    const png = await renderSprite(id, sprite);
    fs.writeFileSync(path.join(OUT_DIR, `${id}.png`), png);
    rendered.push(png);
}

// Contact sheet on a dark background for review.
const columns = 6;
const cell = 16 * SCALE + 16;
const sheetRows = Math.ceil(rendered.length / columns);
await sharp({ create: { width: columns * cell, height: sheetRows * cell, channels: 4, background: "#1a1b1e" } })
    .composite(rendered.map((input, index) => ({ input, left: (index % columns) * cell + 8, top: Math.floor(index / columns) * cell + 8 })))
    .png()
    .toFile(path.join(root, "docs", "stickers-sheet.png"));
console.log(`wrote ${rendered.length} stickers to apps/web/src/ui/assets/stickers and docs/stickers-sheet.png`);
