// SPDX-License-Identifier: AGPL-3.0-only
// Builds every icon and image the apps ship from the source artwork in branding/.
// Run with: node scripts/generate-branding.mjs   (outputs are committed; rerun after changing the artwork)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const branding = (name) => path.join(root, "branding", name);
const out = (relative) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
};

// The icon is pixel art (a 200×200 grid, found by measuring where its edges fall) that was scaled up ~10× and
// saved as a JPEG over a fake gray/white checkerboard. Rebuild it as clean pixel art: one color per grid cell (the
// median of the cell's middle, away from JPEG smear at its borders), the checkerboard cleared cell by cell (a
// flood from the border, then the light leftovers hugging the outline), so edges are crisp instead of fringed.
// Every output is made from a nearest-neighbour master at 10× the grid, scaled down with a proper filter.
const ICON_GRID = 200;

async function cutOutIcon(source) {
    const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const cell = info.width / ICON_GRID;
    const pixels = new Uint8Array(ICON_GRID * ICON_GRID * 4);
    const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
    for (let row = 0; row < ICON_GRID; row += 1) {
        for (let col = 0; col < ICON_GRID; col += 1) {
            const channels = [[], [], []];
            const x0 = Math.floor(col * cell + cell * 0.25);
            const x1 = Math.ceil(col * cell + cell * 0.75);
            const y0 = Math.floor(row * cell + cell * 0.25);
            const y1 = Math.ceil(row * cell + cell * 0.75);
            for (let y = y0; y < y1; y += 1) {
                for (let x = x0; x < x1; x += 1) {
                    const offset = (y * info.width + x) * 3;
                    for (let c = 0; c < 3; c += 1) channels[c].push(data[offset + c]);
                }
            }
            const target = (row * ICON_GRID + col) * 4;
            for (let c = 0; c < 3; c += 1) pixels[target + c] = median(channels[c]);
            pixels[target + 3] = 255;
        }
    }
    // Background: light, colorless cells (white or the checkerboard's gray). Flood from the border...
    const light = (index, min) => {
        const r = pixels[index * 4];
        const g = pixels[index * 4 + 1];
        const b = pixels[index * 4 + 2];
        return Math.min(r, g, b) > min && Math.max(r, g, b) - Math.min(r, g, b) < 28;
    };
    const clear = new Uint8Array(ICON_GRID * ICON_GRID);
    const flood = (min) => {
        const stack = [];
        for (let index = 0; index < ICON_GRID * ICON_GRID; index += 1) {
            const x = index % ICON_GRID;
            const y = Math.floor(index / ICON_GRID);
            const onBorder = x === 0 || y === 0 || x === ICON_GRID - 1 || y === ICON_GRID - 1;
            const nextToClear = (x > 0 && clear[index - 1]) || (x < ICON_GRID - 1 && clear[index + 1]) || (y > 0 && clear[index - ICON_GRID]) || (y < ICON_GRID - 1 && clear[index + ICON_GRID]);
            if (!clear[index] && (onBorder || nextToClear)) stack.push(index);
        }
        while (stack.length > 0) {
            const index = stack.pop();
            if (clear[index] || !light(index, min)) continue;
            clear[index] = 1;
            const x = index % ICON_GRID;
            if (x > 0) stack.push(index - 1);
            if (x < ICON_GRID - 1) stack.push(index + 1);
            if (index >= ICON_GRID) stack.push(index - ICON_GRID);
            if (index < ICON_GRID * (ICON_GRID - 1)) stack.push(index + ICON_GRID);
        }
    };
    flood(175);
    // ...then a looser pass for the half-gray cells left against the dark outline (the badge's inside is walled off
    // by that outline, so this never reaches the artwork).
    flood(60);
    for (let index = 0; index < clear.length; index += 1) if (clear[index]) pixels.subarray(index * 4, index * 4 + 4).fill(0);
    const native = await sharp(pixels, { raw: { width: ICON_GRID, height: ICON_GRID, channels: 4 } }).trim().png().toBuffer();
    const meta = await sharp(native).metadata();
    const side = Math.max(meta.width, meta.height);
    const square = await sharp(native)
        .extend({
            top: Math.floor((side - meta.height) / 2),
            bottom: Math.ceil((side - meta.height) / 2),
            left: Math.floor((side - meta.width) / 2),
            right: Math.ceil((side - meta.width) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    return sharp(square).resize(side * 10, side * 10, { kernel: "nearest" }).png().toBuffer();
}

// Prefer a PNG source (e.g. a newer export) over the original JPEG.
const iconSource = fs.existsSync(branding("meadhall-icon.png")) ? branding("meadhall-icon.png") : branding("meadhall-icon.jpg");
const icon = await cutOutIcon(iconSource);
const targets = [
    ["apps/desktop/assets/icon.png", 512],
    ["apps/desktop/assets/tray.png", 32],
    ["apps/desktop/assets/tray@2x.png", 64],
    ["apps/web/public/favicon.png", 64],
    ["apps/web/public/apple-touch-icon.png", 180],
    // Shown at 48px; 4× for sharp downscaling on high-density screens.
    ["apps/web/src/ui/assets/meadhall-icon.png", 192],
    ["apps/mobile/resources/icon.png", 1024],
];
for (const [relative, size] of targets) {
    const resized = sharp(icon).resize(size, size, { kernel: "lanczos3" });
    // Small sizes lose the outline to the filter; a light sharpen brings it back.
    await (size <= 64 ? resized.sharpen({ sigma: 0.5 }) : resized).png().toFile(out(relative));
    console.log(`wrote ${relative} (${size}px)`);
}

await sharp(branding("meadhall-hall.jpg")).webp({ quality: 82 }).toFile(out("apps/web/src/ui/assets/login-hall.webp"));
console.log("wrote apps/web/src/ui/assets/login-hall.webp");

// Phone home screens crop icons to their own shape (a circle, squircle or rounded square), which cut the badge's
// frame off at the corners. So phone icons use the scene inside the badge (horn, mug, barrel, food) full bleed:
// the shape only ever trims the plain backdrop. Positions are in the 1024px icon's coordinates.
const SCENE_BACKGROUND = "#231c23"; // the backdrop's darkest color, around the scene
const iconSide = (await sharp(icon).metadata()).width;
const scene = (left, top, size) => {
    const scale = iconSide / 1024;
    return sharp(icon)
        .extract({ left: Math.round(left * scale), top: Math.round(top * scale), width: Math.round(size * scale), height: Math.round(size * scale) })
        .png()
        .toBuffer();
};
// Just inside the frame (none of the gold border).
const sceneTight = await scene(72, 64, 880);

// Android (Capacitor) launcher icons and splash screens.
const ANDROID_BACKGROUND = SCENE_BACKGROUND;
const res = (relative) => out(`apps/mobile/android/app/src/main/res/${relative}`);
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
    const size = Math.round(48 * scale);
    // Older Android (no adaptive icons): a rounded square and a circle.
    const radius = Math.round(size * 0.18);
    await sharp(sceneTight)
        .resize(size, size, { kernel: "lanczos3" })
        .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`), blend: "dest-in" }])
        .png()
        .toFile(res(`mipmap-${density}/ic_launcher.png`));
    await sharp(sceneTight)
        .resize(size, size, { kernel: "lanczos3" })
        .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`), blend: "dest-in" }])
        .png()
        .toFile(res(`mipmap-${density}/ic_launcher_round.png`));
    // Adaptive icon foreground: a 108dp canvas of which launchers show at most the middle 72dp, masked to their
    // shape. The scene is 60dp, so the horn stays well inside the 66dp safe circle, and its edge fades (5dp) into the
    // backdrop color, which fills the rest: no seam under any mask, and room for parallax and zoom effects.
    const canvas = Math.round(108 * scale);
    const art = Math.round(60 * scale);
    const fade = 5 * scale;
    const inset = Math.round((canvas - art) / 2);
    const edge = await sharp(
        Buffer.from(`<svg width="${art}" height="${art}"><rect x="${fade}" y="${fade}" width="${art - 2 * fade}" height="${art - 2 * fade}" rx="${fade * 2}" fill="#fff"/></svg>`),
    )
        .blur(fade / 2)
        .png()
        .toBuffer();
    const faded = await sharp(sceneTight).resize(art, art, { kernel: "lanczos3" }).ensureAlpha().composite([{ input: edge, blend: "dest-in" }]).png().toBuffer();
    await sharp({ create: { width: canvas, height: canvas, channels: 4, background: SCENE_BACKGROUND } })
        .composite([{ input: faded, left: inset, top: inset }])
        .png()
        .toFile(res(`mipmap-${density}/ic_launcher_foreground.png`));
}
fs.writeFileSync(
    res("values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ANDROID_BACKGROUND}</color>\n</resources>\n`,
);
const splashDir = path.join(root, "apps/mobile/android/app/src/main/res");
for (const folder of fs.readdirSync(splashDir).filter((name) => name.startsWith("drawable"))) {
    const splash = path.join(splashDir, folder, "splash.png");
    if (!fs.existsSync(splash)) continue;
    const { width, height } = await sharp(splash).metadata();
    const art = Math.round(Math.min(width, height) * 0.3);
    const artwork = await sharp(icon).resize(art, art).png().toBuffer();
    await sharp({ create: { width, height, channels: 4, background: ANDROID_BACKGROUND } })
        .composite([{ input: artwork, gravity: "center" }])
        .png()
        .toFile(splash);
}
console.log("wrote Android launcher icons and splash screens");

// iOS (Capacitor) app icon and splash screens. The App Store refuses icons with transparency (the scene is opaque;
// flattening is a safeguard).
const ios = (relative) => out(`apps/mobile/ios/App/App/Assets.xcassets/${relative}`);
// iOS rounds the corners itself: the scene fills the square.
await sharp(sceneTight).resize(1024, 1024, { kernel: "lanczos3" }).flatten({ background: SCENE_BACKGROUND }).png().toFile(ios("AppIcon.appiconset/AppIcon-512@2x.png"));
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    const artwork = await sharp(icon).resize(820, 820).png().toBuffer();
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: ANDROID_BACKGROUND } })
        .composite([{ input: artwork, gravity: "center" }])
        .png()
        .toFile(ios(`Splash.imageset/${name}`));
}
console.log("wrote the iOS app icon and splash screens");
