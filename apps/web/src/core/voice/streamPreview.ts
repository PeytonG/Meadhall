// SPDX-License-Identifier: AGPL-3.0-only
// "Streaming Now" previews, like Discord's: while you share your screen, your app posts a small snapshot of it to the
// voice channel every so often (io.github.peytong.meadhall.stream_preview, an event no app shows in the timeline).
// Hovering someone's LIVE badge in the channel list shows the latest one. Only the channel's members can see it, and
// nothing is posted when you aren't sharing. Not in encrypted channels: there the event would arrive encrypted, which
// homeservers count as a new message, so everyone would get an unread badge every few seconds.
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

export const STREAM_PREVIEW_EVENT = "io.github.peytong.meadhall.stream_preview";
export const STREAM_PREVIEW_INTERVAL_MS = 20_000;
// Older snapshots aren't shown (the stream has moved on, or ended).
const MAX_AGE_MS = 90_000;
const WIDTH = 320;
const HEIGHT = 180;

export interface StreamPreviewContent {
    url: string;
    w: number;
    h: number;
}

export function canPostStreamPreview(room: Room | null): boolean {
    return Boolean(room && !room.hasEncryptionStateEvent());
}

// One frame of a video track, as a small JPEG.
export async function grabFrame(track: MediaStreamTrack): Promise<{ blob: Blob; w: number; h: number } | null> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    try {
        await video.play();
        if (video.readyState < 2) await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
        const sourceW = video.videoWidth || WIDTH;
        const sourceH = video.videoHeight || HEIGHT;
        const scale = Math.min(WIDTH / sourceW, HEIGHT / sourceH, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceW * scale));
        canvas.height = Math.max(1, Math.round(sourceH * scale));
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
        return blob ? { blob, w: canvas.width, h: canvas.height } : null;
    } finally {
        video.pause();
        video.srcObject = null;
    }
}

export async function postStreamPreview(client: MatrixClient, roomId: string, track: MediaStreamTrack): Promise<void> {
    if (!canPostStreamPreview(client.getRoom(roomId))) return;
    const frame = await grabFrame(track);
    if (!frame) return;
    const { content_uri: url } = await client.uploadContent(frame.blob, { includeFilename: false, type: "image/jpeg" });
    const content: StreamPreviewContent = { url, w: frame.w, h: frame.h };
    await client.sendEvent(roomId, STREAM_PREVIEW_EVENT as never, content as never);
}

// The newest snapshot someone posted in a room, if it's recent.
export function latestStreamPreview(room: Room, userId: string, now = Date.now()): MatrixEvent | null {
    const events = room.getLiveTimeline().getEvents();
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index]!;
        if (now - event.getTs() > MAX_AGE_MS) return null;
        if (event.getType() === STREAM_PREVIEW_EVENT && event.getSender() === userId) return event;
    }
    return null;
}

const loaded = new Map<string, Promise<string | null>>();

function mediaPath(mxc: string): string | null {
    const match = /^mxc:\/\/([^/]+)\/([^/?#]+)$/.exec(mxc);
    return match ? `/_matrix/client/v1/media/download/${encodeURIComponent(match[1]!)}/${encodeURIComponent(match[2]!)}` : null;
}

// An object URL for a snapshot (authenticated media, downloaded with your access token). Cached per event.
export function streamPreviewUrl(client: MatrixClient, event: MatrixEvent): Promise<string | null> {
    const id = event.getId() ?? "";
    const cached = loaded.get(id);
    if (cached) return cached;
    const promise = (async (): Promise<string | null> => {
        const content = event.getContent() as Partial<StreamPreviewContent>;
        const path = typeof content.url === "string" ? mediaPath(content.url) : null;
        if (!path) return null;
        const response = await fetch(`${client.getHomeserverUrl().replace(/\/+$/, "")}${path}`, {
            headers: { Authorization: `Bearer ${client.getAccessToken() ?? ""}` },
        });
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
    })().catch(() => null);
    loaded.set(id, promise);
    return promise;
}
