// SPDX-License-Identifier: AGPL-3.0-only
// Soundboard: built-in sounds plus your own, played into a call for everyone (and for you).
//
// Your own sounds are uploaded to your homeserver's media repository and listed in your account data, so they
// follow you to every device. In a call the soundboard publishes its own audio track next to the microphone: it
// is heard even while you're muted, and other Matrix clients play it like any other audio.
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { mediaFromMxc } from "../../../core/media/media";

export const SOUNDBOARD_ACCOUNT_DATA = "io.github.peytong.meadhall.soundboard";
export const MAX_CUSTOM_SOUNDS = 24;
export const MAX_SOUND_BYTES = 1024 * 1024;
export const MAX_SOUND_SECONDS = 8;

export interface CustomSound {
    id: string;
    name: string;
    emoji: string;
    mxc: string;
}

export function parseCustomSounds(content: unknown): CustomSound[] {
    const sounds = (content as { sounds?: unknown } | null)?.sounds;
    if (!Array.isArray(sounds)) return [];
    return sounds
        .filter((sound): sound is Record<string, unknown> => Boolean(sound) && typeof sound === "object")
        .map((sound) => ({
            id: typeof sound.id === "string" ? sound.id : "",
            name: typeof sound.name === "string" ? sound.name.slice(0, 32) : "Sound",
            emoji: typeof sound.emoji === "string" ? [...sound.emoji].slice(0, 2).join("") : "🔊",
            mxc: typeof sound.mxc === "string" ? sound.mxc : "",
        }))
        .filter((sound) => sound.id && sound.mxc.startsWith("mxc://"))
        .slice(0, MAX_CUSTOM_SOUNDS);
}

export function loadCustomSounds(client: MatrixClient): CustomSound[] {
    return parseCustomSounds(client.getAccountData(SOUNDBOARD_ACCOUNT_DATA as never)?.getContent());
}

async function saveCustomSounds(client: MatrixClient, sounds: CustomSound[]): Promise<void> {
    await client.setAccountData(SOUNDBOARD_ACCOUNT_DATA as never, { sounds } as never);
}

// Checks the file is a short, playable sound, then uploads it and adds it to your list.
export async function addCustomSound(client: MatrixClient, file: File, name: string, emoji: string): Promise<CustomSound> {
    const existing = loadCustomSounds(client);
    if (existing.length >= MAX_CUSTOM_SOUNDS) throw new Error(`You can keep up to ${MAX_CUSTOM_SOUNDS} sounds.`);
    if (file.size > MAX_SOUND_BYTES) throw new Error("Sounds can be up to 1 MB.");
    const context = new OfflineAudioContext(1, 1, 48_000);
    let duration: number;
    try {
        duration = (await context.decodeAudioData(await file.arrayBuffer())).duration;
    } catch {
        throw new Error("That file isn't a sound Meadhall can play (try MP3, OGG or WAV).");
    }
    if (duration > MAX_SOUND_SECONDS) throw new Error(`Sounds can be up to ${MAX_SOUND_SECONDS} seconds long.`);
    const upload = await client.uploadContent(file, { includeFilename: true, type: file.type || "audio/mpeg", name: file.name });
    const sound: CustomSound = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim().slice(0, 32) || file.name.replace(/\.[^.]+$/, "").slice(0, 32) || "Sound",
        emoji: [...emoji.trim()].slice(0, 2).join("") || "🔊",
        mxc: upload.content_uri,
    };
    await saveCustomSounds(client, [...existing, sound]);
    return sound;
}

export async function removeCustomSound(client: MatrixClient, id: string): Promise<void> {
    await saveCustomSounds(client, loadCustomSounds(client).filter((sound) => sound.id !== id));
}

const customCache = new Map<string, Promise<ArrayBuffer>>();

// Downloads one of your sounds (authenticated media needs the access token).
export async function decodeCustomSound(client: MatrixClient, sound: CustomSound, context: BaseAudioContext): Promise<AudioBuffer> {
    let download = customCache.get(sound.mxc);
    if (!download) {
        const url = mediaFromMxc(client, sound.mxc);
        if (!url) throw new Error("Sound unavailable.");
        const token = client.getAccessToken();
        download = fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }).then((response) => {
            if (!response.ok) throw new Error(`Sound download failed (${response.status}).`);
            return response.arrayBuffer();
        });
        customCache.set(sound.mxc, download);
        download.catch(() => customCache.delete(sound.mxc));
    }
    // decodeAudioData detaches the buffer it's given, so decode a copy.
    return context.decodeAudioData((await download).slice(0));
}

// Plays sounds both to you and into a MediaStream that a call publishes as its own track.
export class SoundboardPlayer {
    readonly context: AudioContext;
    private readonly destination: MediaStreamAudioDestinationNode;
    private readonly toCall: GainNode;
    private readonly toYou: GainNode;

    constructor() {
        this.context = new AudioContext();
        this.destination = this.context.createMediaStreamDestination();
        this.toCall = this.context.createGain();
        this.toCall.gain.value = 0.8;
        this.toCall.connect(this.destination);
        this.toYou = this.context.createGain();
        this.toYou.gain.value = 0.8;
        this.toYou.connect(this.context.destination);
    }

    get track(): MediaStreamTrack {
        return this.destination.stream.getAudioTracks()[0];
    }

    // Deafened: you don't hear it, but the call still does.
    setHearOwnSounds(hear: boolean): void {
        this.toYou.gain.value = hear ? 0.8 : 0;
    }

    async play(buffer: AudioBuffer): Promise<void> {
        if (this.context.state === "suspended") await this.context.resume().catch(() => undefined);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.toCall);
        source.connect(this.toYou);
        source.start();
    }

    close(): void {
        void this.context.close().catch(() => undefined);
    }
}
