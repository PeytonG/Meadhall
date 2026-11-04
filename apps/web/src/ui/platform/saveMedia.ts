// SPDX-License-Identifier: AGPL-3.0-only
// Download buttons on attachments and in viewers. A link with `download` isn't enough: pictures and files live on the
// homeserver (another site, so browsers ignore `download` and just open them), authenticated media needs the access
// token, and the Android WebView ignores downloads altogether.
import type { MatrixClient } from "matrix-js-sdk";

import { canSaveNatively, saveDownloadNatively } from "./nativeApp";

// Fetch the file as a blob. The access token is only ever sent to the user's own homeserver.
export async function fetchMediaBlob(client: MatrixClient, url: string): Promise<Blob> {
    if (url.startsWith("blob:") || url.startsWith("data:")) {
        return (await fetch(url)).blob();
    }
    const headers: Record<string, string> = {};
    const token = client.getAccessToken();
    const homeserver = new URL(client.getHomeserverUrl()).origin;
    if (token && new URL(url, window.location.href).origin === homeserver) {
        headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
    }
    return response.blob();
}

// Save a picture or file under its name. Returns where it went on phones ("Downloads"), or null when the browser or
// desktop app took over (its own download bar or save dialog).
export async function saveMedia(client: MatrixClient, url: string, fileName: string, mimeType?: string): Promise<string | null> {
    let blob = await fetchMediaBlob(client, url);
    if (mimeType && (!blob.type || blob.type === "application/octet-stream")) {
        blob = new Blob([blob], { type: mimeType });
    }
    if (canSaveNatively()) {
        const saved = await saveDownloadNatively(fileName, blob);
        return saved.folder;
    }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return null;
}
