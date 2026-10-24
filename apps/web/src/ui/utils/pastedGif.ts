// SPDX-License-Identifier: AGPL-3.0-only
// Copying a GIF in a browser (or Discord) puts only a still PNG of its first frame on the clipboard as a file, plus
// HTML or a link pointing at the original. On paste, fetch that original so the GIF still loops; anything that goes
// wrong falls back to the still picture.
const MAX_BYTES = 20 * 1024 * 1024;
const ANIMATED_TYPES = new Set(["image/gif", "image/webp"]);

export function findPastedGifUrl(clipboard: Pick<DataTransfer, "getData">): string | null {
    const candidates: string[] = [];
    const html = clipboard.getData("text/html");
    if (html) {
        const parsed = new DOMParser().parseFromString(html, "text/html");
        for (const image of Array.from(parsed.querySelectorAll("img"))) {
            const src = image.getAttribute("src");
            if (src) candidates.push(src);
        }
    }
    for (const line of clipboard.getData("text/uri-list").split(/\r?\n/)) {
        if (line && !line.startsWith("#")) candidates.push(line.trim());
    }
    for (const candidate of candidates) {
        try {
            const url = new URL(candidate);
            if (url.protocol === "https:" && /\.(gif|webp)$/i.test(url.pathname)) return url.toString();
        } catch {
            // Not a URL.
        }
    }
    return null;
}

export async function fetchPastedGif(url: string, signal?: AbortSignal): Promise<File | null> {
    try {
        const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) return null;
        const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
        if (!ANIMATED_TYPES.has(type)) return null;
        if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
        const blob = await response.blob();
        if (blob.size === 0 || blob.size > MAX_BYTES) return null;
        const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "image.gif");
        return new File([blob], name, { type });
    } catch {
        return null;
    }
}
