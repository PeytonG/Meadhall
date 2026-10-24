// SPDX-License-Identifier: AGPL-3.0-only
// Sharing sounds and style profiles in chats: the .meadhall file is uploaded and sent as an attachment marked with
// SHARE_CONTENT_KEY, so Meadhall shows a card with what it adds and an Adopt button. Other apps just see a file.
import { MsgType, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { mediaFromMxc } from "../media/media";
import {
    MAX_MEADHALL_FILE_BYTES,
    MEADHALL_MIME,
    SHARE_CONTENT_KEY,
    encodeMeadhallFile,
    fileNameFor,
    parseMeadhallFile,
    summaryOf,
    type MeadhallItem,
} from "./meadhallFile";

// Uploads once and posts it to each chat. Returns the chats it failed in.
export async function shareToRooms(client: MatrixClient, roomIds: string[], item: MeadhallItem): Promise<string[]> {
    const text = encodeMeadhallFile(item);
    const name = fileNameFor(item);
    const blob = new Blob([text], { type: MEADHALL_MIME });
    if (blob.size > MAX_MEADHALL_FILE_BYTES) throw new Error("That's too big to share.");
    const { content_uri: url } = await client.uploadContent(blob, { type: MEADHALL_MIME, name });
    const failed: string[] = [];
    for (const roomId of roomIds) {
        try {
            await client.sendMessage(roomId, {
                msgtype: MsgType.File,
                body: name,
                url,
                info: { mimetype: MEADHALL_MIME, size: blob.size },
                [SHARE_CONTENT_KEY]: summaryOf(item),
            } as never);
        } catch {
            failed.push(roomId);
        }
    }
    return failed;
}

// Downloads and checks the shared file from a message (plain attachments only).
export async function fetchSharedItem(client: MatrixClient, mxc: string): Promise<MeadhallItem> {
    const url = mediaFromMxc(client, mxc);
    if (!url) throw new Error("This share isn't available.");
    const token = client.getAccessToken();
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) throw new Error(`Couldn't download it (${response.status}).`);
    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > MAX_MEADHALL_FILE_BYTES) throw new Error("That .meadhall file is too big.");
    return parseMeadhallFile(await response.text());
}

export async function readMeadhallFile(file: File): Promise<MeadhallItem> {
    if (file.size > MAX_MEADHALL_FILE_BYTES) throw new Error("That .meadhall file is too big.");
    return parseMeadhallFile(await file.text());
}

// Saves an item as a .meadhall file on this device.
export function downloadMeadhallFile(item: MeadhallItem): void {
    const url = URL.createObjectURL(new Blob([encodeMeadhallFile(item)], { type: MEADHALL_MIME }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameFor(item);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
