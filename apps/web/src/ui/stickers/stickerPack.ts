// SPDX-License-Identifier: AGPL-3.0-only
// Meadhall's built-in pixel-art sticker pack. Artwork: scripts/generate-stickers.mjs -> ../assets/stickers/*.png.

export interface Sticker {
    id: string;
    name: string;
    url: string;
    size: number;
}

const STICKER_NAMES: Record<string, string> = {
    cheers: "Cheers",
    heart: "Heart",
    crown: "Crown",
    shield: "Shield",
    sword: "Sword",
    fire: "Fire",
    coin: "Gold",
    gg: "GG",
    thumbs_up: "Thumbs up",
    lol: "LOL",
    skull: "RIP",
    sparkles: "Wow",
};

const STICKER_URLS = import.meta.glob<string>("../assets/stickers/*.png", { eager: true, import: "default" });

// Rendered at 16x16 pixels x 8.
export const STICKER_SIZE = 128;

export const STICKERS: Sticker[] = Object.entries(STICKER_NAMES).flatMap(([id, name]) => {
    const url = STICKER_URLS[`../assets/stickers/${id}.png`];
    return url ? [{ id, name, url, size: STICKER_SIZE }] : [];
});
