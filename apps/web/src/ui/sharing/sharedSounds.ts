// SPDX-License-Identifier: AGPL-3.0-only
// Soundboard sounds as .meadhall shares: packing one of your sounds, and adopting someone else's into your soundboard
// (through the same checks as adding a sound yourself: playable, up to 8 seconds and 1 MB).
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { mediaFromMxc } from "../../core/media/media";
import { base64ToBytes, bytesToBase64, type SharedSound } from "../../core/sharing/meadhallFile";
import { addCustomSound, type CustomSound } from "../voice/soundboard/soundboard";

export async function soundToShare(client: MatrixClient, sound: CustomSound): Promise<SharedSound> {
    const url = mediaFromMxc(client, sound.mxc);
    if (!url) throw new Error("That sound isn't available.");
    const token = client.getAccessToken();
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) throw new Error(`Couldn't load the sound (${response.status}).`);
    const mime = (response.headers.get("content-type") ?? "audio/wav").split(";")[0]!.trim().toLowerCase();
    return { kind: "sound", name: sound.name, emoji: sound.emoji, mime: mime.startsWith("audio/") ? mime : "audio/wav", audio: bytesToBase64(new Uint8Array(await response.arrayBuffer())) };
}

export async function adoptSharedSound(client: MatrixClient, shared: SharedSound): Promise<CustomSound> {
    const extension = shared.mime.split("/")[1]?.replace(/^x-/, "") ?? "wav";
    const file = new File([base64ToBytes(shared.audio)], `${shared.name}.${extension}`, { type: shared.mime });
    return addCustomSound(client, file, shared.name, shared.emoji);
}

// Plays a shared sound for you only (the card's preview button).
export async function previewSharedSound(shared: SharedSound): Promise<void> {
    const context = new AudioContext();
    try {
        const buffer = await context.decodeAudioData(base64ToBytes(shared.audio).buffer);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start();
        source.onended = () => void context.close();
    } catch (error) {
        void context.close();
        throw error;
    }
}
