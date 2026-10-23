// SPDX-License-Identifier: AGPL-3.0-only
// Trimming a sound before it goes on the soundboard: pick a start and end (up to MAX_SOUND_SECONDS), and the clip is
// re-encoded as a small mono WAV, which also keeps long or high-quality files under the size limit.
import { MAX_SOUND_SECONDS } from "./soundboard";

export const CLIP_SAMPLE_RATE = 24_000;
export const MIN_CLIP_SECONDS = 0.2;

export async function decodeSoundFile(file: Blob): Promise<AudioBuffer> {
    const context = new OfflineAudioContext(1, 1, 48_000);
    try {
        return await context.decodeAudioData(await file.arrayBuffer());
    } catch {
        throw new Error("That file isn't a sound Meadhall can play (try MP3, OGG or WAV).");
    }
}

// The selection a new file starts with: all of it, or the first MAX_SOUND_SECONDS.
export function initialSelection(duration: number): { start: number; end: number } {
    return { start: 0, end: Math.min(duration, MAX_SOUND_SECONDS) };
}

// Keeps a selection valid: inside the sound, at least MIN_CLIP_SECONDS and at most MAX_SOUND_SECONDS long. `moved`
// says which handle the person is dragging, so the other one follows instead of the drag being refused.
export function clampSelection(
    selection: { start: number; end: number },
    duration: number,
    moved: "start" | "end",
): { start: number; end: number } {
    let start = Math.max(0, Math.min(selection.start, duration));
    let end = Math.max(0, Math.min(selection.end, duration));
    if (moved === "start") {
        start = Math.min(start, Math.max(0, duration - MIN_CLIP_SECONDS));
        if (end < start + MIN_CLIP_SECONDS) end = start + MIN_CLIP_SECONDS;
        if (end - start > MAX_SOUND_SECONDS) end = start + MAX_SOUND_SECONDS;
    } else {
        end = Math.max(end, Math.min(duration, MIN_CLIP_SECONDS));
        if (start > end - MIN_CLIP_SECONDS) start = Math.max(0, end - MIN_CLIP_SECONDS);
        if (end - start > MAX_SOUND_SECONDS) start = end - MAX_SOUND_SECONDS;
    }
    return { start: Math.round(start * 100) / 100, end: Math.round(Math.min(end, duration) * 100) / 100 };
}

// Loudest sample per slice, for drawing the waveform.
export function waveformPeaks(samples: Float32Array, bins: number): number[] {
    const peaks: number[] = [];
    const size = Math.max(1, Math.floor(samples.length / bins));
    for (let bin = 0; bin < bins; bin += 1) {
        let peak = 0;
        const end = Math.min(samples.length, (bin + 1) * size);
        for (let index = bin * size; index < end; index += 1) peak = Math.max(peak, Math.abs(samples[index]));
        peaks.push(peak);
    }
    return peaks;
}

// The selected part, mixed to mono at CLIP_SAMPLE_RATE.
export async function renderClip(buffer: AudioBuffer, start: number, end: number): Promise<AudioBuffer> {
    const seconds = Math.max(MIN_CLIP_SECONDS, end - start);
    const context = new OfflineAudioContext(1, Math.ceil(seconds * CLIP_SAMPLE_RATE), CLIP_SAMPLE_RATE);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0, start, seconds);
    return context.startRendering();
}

// 16-bit PCM WAV of mono samples.
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string): void => {
        for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let index = 0; index < samples.length; index += 1) {
        const value = Math.max(-1, Math.min(1, samples[index]));
        view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    }
    return bytes;
}

export async function trimToWav(buffer: AudioBuffer, start: number, end: number, name: string): Promise<File> {
    const clip = await renderClip(buffer, start, end);
    const wav = encodeWav(clip.getChannelData(0), clip.sampleRate);
    return new File([wav], `${name.replace(/\.[^.]+$/, "") || "sound"}.wav`, { type: "audio/wav" });
}
