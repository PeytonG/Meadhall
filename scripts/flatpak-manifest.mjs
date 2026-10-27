// SPDX-License-Identifier: AGPL-3.0-only
// Points the Flatpak manifest at a published release's .deb: downloads it, checks it against the release's
// SHA256SUMS.txt, and writes the URL and sha256 into packaging/flatpak/io.github.peytong.meadhall.yml.
// Usage: node scripts/flatpak-manifest.mjs 0.4.0
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    console.error("Usage: node scripts/flatpak-manifest.mjs <version, e.g. 0.4.0>");
    process.exit(1);
}

const base = `https://github.com/PeytonG/Meadhall/releases/download/v${version}`;
const file = `Meadhall-${version}-amd64.deb`;

async function download(url) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

const deb = await download(`${base}/${file}`);
const sha256 = crypto.createHash("sha256").update(deb).digest("hex");
const sums = (await download(`${base}/SHA256SUMS.txt`)).toString("utf8");
const listed = sums.split("\n").find((line) => line.trim().endsWith(file))?.split(/\s+/)[0];
if (listed !== sha256) throw new Error(`${file}: sha256 ${sha256} doesn't match SHA256SUMS.txt (${listed ?? "missing"})`);

const manifest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packaging", "flatpak", "io.github.peytong.meadhall.yml");
let text = fs.readFileSync(manifest, "utf8");
text = text
    .replace(/url: https:\/\/github\.com\/PeytonG\/Meadhall\/releases\/download\/v[^/]+\/Meadhall-[^\s]+-amd64\.deb/, `url: ${base}/${file}`)
    .replace(/sha256: "?[0-9a-f]{64}"?/, `sha256: "${sha256}"`);
fs.writeFileSync(manifest, text);
console.log(`Manifest now points at ${file} (sha256 ${sha256}).`);
