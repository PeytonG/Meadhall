// SPDX-License-Identifier: AGPL-3.0-only
import { EventType, type MatrixClient } from "matrix-js-sdk/src/matrix";

import type { Sticker } from "./stickerPack";

// mxc:// URLs of stickers already uploaded, per homeserver, so each sticker is uploaded once.
const UPLOAD_CACHE_STORAGE_ITEM = "heorot.stickers.mxc.v1";

type UploadCache = Record<string, Record<string, string>>;

function readCache(): UploadCache {
    try {
        const parsed = JSON.parse(localStorage.getItem(UPLOAD_CACHE_STORAGE_ITEM) ?? "{}") as unknown;
        return parsed && typeof parsed === "object" ? (parsed as UploadCache) : {};
    } catch {
        return {};
    }
}

function writeCache(cache: UploadCache): void {
    try {
        localStorage.setItem(UPLOAD_CACHE_STORAGE_ITEM, JSON.stringify(cache));
    } catch {
        // Not cached: the sticker is uploaded again next time.
    }
}

// The build inlines small images as data: URLs, which the Content Security Policy doesn't let us fetch().
async function loadStickerImage(sticker: Sticker): Promise<Blob> {
    const inline = /^data:([^;,]+);base64,(.*)$/.exec(sticker.url);
    if (inline) {
        const bytes = Uint8Array.from(atob(inline[2]), (char) => char.charCodeAt(0));
        return new Blob([bytes], { type: inline[1] });
    }
    const response = await fetch(sticker.url);
    if (!response.ok) {
        throw new Error(`Couldn't load the "${sticker.name}" sticker.`);
    }
    return response.blob();
}

async function uploadSticker(client: MatrixClient, sticker: Sticker): Promise<{ mxc: string; bytes: number }> {
    const homeserver = client.getHomeserverUrl();
    const blob = await loadStickerImage(sticker);
    const cached = readCache()[homeserver]?.[sticker.id];
    if (cached) {
        return { mxc: cached, bytes: blob.size };
    }
    const { content_uri: mxc } = await client.uploadContent(blob, { name: `${sticker.id}.png`, type: "image/png" });
    const cache = readCache();
    cache[homeserver] = { ...cache[homeserver], [sticker.id]: mxc };
    writeCache(cache);
    return { mxc, bytes: blob.size };
}

// Sends a standard m.sticker event, so Element and other Matrix clients show it too.
export async function sendSticker(client: MatrixClient, roomId: string, sticker: Sticker): Promise<void> {
    const { mxc, bytes } = await uploadSticker(client, sticker);
    await client.sendEvent(roomId, EventType.Sticker, {
        body: sticker.name,
        url: mxc,
        info: { w: sticker.size, h: sticker.size, mimetype: "image/png", size: bytes },
    });
}
