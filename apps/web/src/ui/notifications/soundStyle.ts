// SPDX-License-Identifier: AGPL-3.0-only
// Sound style (Settings → Notifications): the same tunes as 8-bit chiptune (square/triangle waves, the default) or
// smooth (soft sine "bell" tones). Used by the message sound, the ringtone and the call join/leave sounds.
export type SoundStyle = "pixel" | "smooth";

let current: SoundStyle = "pixel";

export function setSoundStyle(style: SoundStyle): void {
    current = style === "smooth" ? "smooth" : "pixel";
}

export function getSoundStyle(): SoundStyle {
    return current;
}

// The wave a tune's lead voice uses in each style.
export function leadWave(style: SoundStyle = current): OscillatorType {
    return style === "smooth" ? "sine" : "square";
}

export function softWave(style: SoundStyle = current): OscillatorType {
    return style === "smooth" ? "sine" : "triangle";
}

// Smooth notes ring out like a bell (fast attack, long exponential decay); pixel notes are flat chiptune blocks.
export function shapeNote(gain: AudioParam, start: number, duration: number, level: number, style: SoundStyle = current): void {
    gain.setValueAtTime(0.0001, start);
    if (style === "smooth") {
        gain.exponentialRampToValueAtTime(level, start + 0.012);
        gain.exponentialRampToValueAtTime(0.0001, start + Math.max(duration * 1.6, 0.25));
        return;
    }
    gain.linearRampToValueAtTime(level, start + 0.005);
    gain.linearRampToValueAtTime(level * 0.7, start + Math.min(0.06, duration / 2));
    gain.setValueAtTime(level * 0.7, start + duration * 0.85);
    gain.linearRampToValueAtTime(0.0001, start + duration * 0.98);
}
