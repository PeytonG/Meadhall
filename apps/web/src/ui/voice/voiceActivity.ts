// SPDX-License-Identifier: AGPL-3.0-only
// Local voice-activity detection for the speaking indicator. LiveKit's active-speaker updates come from the server
// and lag up to half a second; measuring each audio track here reacts within ~50 ms. Speaking starts as soon as the
// level crosses the threshold and holds briefly after it drops, so words don't flicker the indicator.

// Level (RMS of the waveform, 0-1) that counts as talking. Low on purpose: quiet mics should light up too.
export const SPEAKING_RMS_THRESHOLD = 0.012;
export const SPEAKING_HOLD_MS = 350;
const POLL_MS = 50;

export function rmsLevel(samples: Float32Array): number {
    let sum = 0;
    for (let index = 0; index < samples.length; index += 1) {
        sum += samples[index] * samples[index];
    }
    return samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
}

// Decides speaking from a stream of levels: on immediately above the threshold, off after the hold time.
export class SpeakingGate {
    private lastLoudAt = Number.NEGATIVE_INFINITY;

    public update(level: number, now: number): boolean {
        if (level >= SPEAKING_RMS_THRESHOLD) {
            this.lastLoudAt = now;
        }
        return now - this.lastLoudAt < SPEAKING_HOLD_MS;
    }
}

interface Monitored {
    source: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    buffer: Float32Array<ArrayBuffer>;
    gate: SpeakingGate;
}

export class VoiceActivityMonitor {
    private context: AudioContext | null = null;
    private readonly monitored = new Map<string, Monitored>();
    private readonly speaking = new Set<string>();
    private timer: number | null = null;

    public constructor(private readonly onChange: () => void) {}

    public isSpeaking(key: string): boolean {
        return this.speaking.has(key);
    }

    // Starts measuring a track under `key` (a participant sid). Replaces any track already measured for that key.
    public track(key: string, mediaStreamTrack: MediaStreamTrack | undefined): void {
        if (!mediaStreamTrack || typeof window === "undefined" || !window.AudioContext) {
            return;
        }
        this.untrack(key);
        try {
            this.context ??= new AudioContext();
            if (this.context.state === "suspended") {
                void this.context.resume().catch(() => undefined);
            }
            const source = this.context.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
            const analyser = this.context.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            this.monitored.set(key, {
                source,
                analyser,
                buffer: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)),
                gate: new SpeakingGate(),
            });
            this.timer ??= window.setInterval(() => this.poll(), POLL_MS);
        } catch {
            // No Web Audio for this track: the server's speaker updates still drive the indicator.
        }
    }

    public untrack(key: string): void {
        const entry = this.monitored.get(key);
        if (entry) {
            entry.source.disconnect();
            this.monitored.delete(key);
        }
        if (this.speaking.delete(key)) {
            this.onChange();
        }
        if (this.monitored.size === 0 && this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }

    public clear(): void {
        for (const key of [...this.monitored.keys()]) {
            this.untrack(key);
        }
        void this.context?.close().catch(() => undefined);
        this.context = null;
    }

    private poll(): void {
        const now = performance.now();
        let changed = false;
        for (const [key, entry] of this.monitored) {
            entry.analyser.getFloatTimeDomainData(entry.buffer);
            const speaking = entry.gate.update(rmsLevel(entry.buffer), now);
            if (speaking !== this.speaking.has(key)) {
                changed = true;
                if (speaking) {
                    this.speaking.add(key);
                } else {
                    this.speaking.delete(key);
                }
            }
        }
        if (changed) {
            this.onChange();
        }
    }
}
