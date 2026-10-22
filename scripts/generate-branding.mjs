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

// The icon artwork is drawn on white. Make the white that touches the image border transparent (flood fill),
// so light pixels inside the artwork are kept.
async function cutOutIcon(source) {
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const isBackground = (offset) => data[offset] > 228 && data[offset + 1] > 228 && data[offset + 2] > 228;
    const visited = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
    while (stack.length > 0) {
        const index = stack.pop();
        if (visited[index] || !isBackground(index * 4)) continue;
        visited[index] = 1;
        data[index * 4 + 3] = 0;
        const x = index % width;
        if (x > 0) stack.push(index - 1);
        if (x < width - 1) stack.push(index + 1);
        if (index >= width) stack.push(index - width);
        if (index < width * (height - 1)) stack.push(index + width);
    }
    const trimmed = await sharp(data, { raw: info }).trim().png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const side = Math.max(meta.width, meta.height);
    return sharp(trimmed)
        .extend({
            top: Math.floor((side - meta.height) / 2),
            bottom: Math.ceil((side - meta.height) / 2),
            left: Math.floor((side - meta.width) / 2),
            right: Math.ceil((side - meta.width) / 2),
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
}

const icon = await cutOutIcon(branding("meadhall-icon.jpg"));
const targets = [
    ["apps/desktop/assets/icon.png", 512],
    ["apps/desktop/assets/tray.png", 32],
    ["apps/desktop/assets/tray@2x.png", 64],
    ["apps/web/public/favicon.png", 64],
    ["apps/web/public/apple-touch-icon.png", 180],
    ["apps/web/src/ui/assets/meadhall-icon.png", 128],
    ["apps/mobile/resources/icon.png", 1024],
];
for (const [relative, size] of targets) {
    await sharp(icon).resize(size, size, { kernel: size <= 64 ? "lanczos3" : "nearest" }).png().toFile(out(relative));
    console.log(`wrote ${relative} (${size}px)`);
}

await sharp(branding("meadhall-hall.jpg")).webp({ quality: 82 }).toFile(out("apps/web/src/ui/assets/login-hall.webp"));
console.log("wrote apps/web/src/ui/assets/login-hall.webp");
