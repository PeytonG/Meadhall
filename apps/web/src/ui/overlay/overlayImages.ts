// SPDX-License-Identifier: AGPL-3.0-only
// Pictures for the game overlay's chat (overlay/OverlayApp.tsx). The overlay window shares the app's session, so a
// picture from an unencrypted room loads straight from the homeserver (the desktop app signs media requests). One from
// an encrypted room is decrypted here, in the main window, and sent as a smaller JPEG (the overlay can't decrypt).
import * as encrypt from "matrix-encrypt-attachment";
import { MsgType, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import type { OverlayImage } from "./overlayState";

const PREVIEW_MAX_SIDE = 1280;
const MAX_ENCRYPTED_BYTES = 15 * 1024 * 1024;
const KEEP = 30;

const decrypted = new Map<string, OverlayImage | "pending" | "failed">();

async function decryptToPreview(client: MatrixClient, file: { url: string } & Record<string, unknown>): Promise<OverlayImage> {
    const httpUrl = client.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true);
    if (!httpUrl) throw new Error("Bad media URL");
    const token = client.getAccessToken();
    const response = await fetch(httpUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const data = await encrypt.decryptAttachment(await response.arrayBuffer(), file as never);
    const bitmap = await createImageBitmap(new Blob([data]));
    const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const src = canvas.toDataURL("image/jpeg", 0.85);
    return { thumb: src, full: src, width: canvas.width, height: canvas.height };
}

// The picture of an image message for the overlay, or null (not a picture, or still being decrypted: `onReady` runs
// when it is, so the overlay can be sent again).
export function overlayImageFor(client: MatrixClient, event: MatrixEvent, onReady: () => void): OverlayImage | null {
    const content = event.getContent() as {
        msgtype?: string;
        url?: unknown;
        file?: { url?: unknown } & Record<string, unknown>;
        info?: { w?: unknown; h?: unknown; size?: unknown };
    };
    if (content.msgtype !== MsgType.Image) return null;
    const width = typeof content.info?.w === "number" ? content.info.w : undefined;
    const height = typeof content.info?.h === "number" ? content.info.h : undefined;
    if (typeof content.url === "string") {
        const thumb = client.mxcUrlToHttp(content.url, 480, 480, "scale", false, true, true);
        const full = client.mxcUrlToHttp(content.url, undefined, undefined, undefined, false, true, true);
        return thumb && full ? { thumb, full, width, height } : null;
    }
    const file = content.file;
    const id = event.getId();
    if (!file || typeof file.url !== "string" || !id) return null;
    const known = decrypted.get(id);
    if (known && known !== "pending" && known !== "failed") return known;
    if (known) return null;
    if (typeof content.info?.size === "number" && content.info.size > MAX_ENCRYPTED_BYTES) return null;
    decrypted.set(id, "pending");
    void decryptToPreview(client, file as { url: string } & Record<string, unknown>)
        .then((image) => {
            decrypted.set(id, image);
            // Keep the newest few.
            while (decrypted.size > KEEP) decrypted.delete(decrypted.keys().next().value!);
            onReady();
        })
        .catch(() => decrypted.set(id, "failed"));
    return null;
}
