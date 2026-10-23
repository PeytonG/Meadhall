// SPDX-License-Identifier: AGPL-3.0-only
// The Meadhall ringtone: an original 8-bit jingle (a rising horn call answered by a tavern bounce), synthesized
// with square and triangle waves like an old console. Plays only for the person being called, looping with a
// pause until they join, dismiss, or the call stops ringing.

type Note = [semitonesFromA4: number | null, beats: number];

// Lead melody (square wave). null = rest. A minor-ish horn call, then a bouncy answer.
const MELODY: Note[] = [
    [-5, 0.5], [-2, 0.5], [3, 1], [null, 0.25],
    [3, 0.25], [2, 0.25], [0, 0.25], [2, 1],
    [null, 0.5],
    [-2, 0.25], [0, 0.25], [2, 0.25], [3, 0.25], [7, 1.5],
];

// Bass (triangle wave), one note per beat-pair.
const BASS: Note[] = [
    [-17, 2], [-14, 2], [-12, 2], [-10, 2],
];

const BEAT_SECONDS = 0.16;
const LOOP_PAUSE_SECONDS = 1.4;

function frequency(semitonesFromA4: number): number {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
}

function scheduleVoice(context: BaseAudioContext, destination: AudioNode, notes: Note[], start: number, type: OscillatorType, level: number): number {
    let time = start;
    for (const [semitones, beats] of notes) {
        const duration = beats * BEAT_SECONDS;
        if (semitones !== null) {
            const oscillator = context.createOscillator();
            oscillator.type = type;
            oscillator.frequency.value = frequency(semitones);
            const envelope = context.createGain();
            // Chiptune envelope: instant attack, short decay to a sustain, quick release.
            envelope.gain.setValueAtTime(0, time);
            envelope.gain.linearRampToValueAtTime(level, time + 0.005);
            envelope.gain.linearRampToValueAtTime(level * 0.7, time + Math.min(0.06, duration / 2));
            envelope.gain.setValueAtTime(level * 0.7, time + duration * 0.85);
            envelope.gain.linearRampToValueAtTime(0, time + duration * 0.98);
            oscillator.connect(envelope).connect(destination);
            oscillator.start(time);
            oscillator.stop(time + duration);
        }
        time += duration;
    }
    return time - start;
}

// Schedules one pass of the jingle at `start`; returns its length in seconds.
export function scheduleRingtone(context: BaseAudioContext, destination: AudioNode, start: number): number {
    const melody = scheduleVoice(context, destination, MELODY, start, "square", 0.09);
    const bass = scheduleVoice(context, destination, BASS, start, "triangle", 0.12);
    return Math.max(melody, bass);
}

export function ringtoneLoopSeconds(): number {
    const length = (notes: Note[]): number => notes.reduce((sum, [, beats]) => sum + beats * BEAT_SECONDS, 0);
    return Math.max(length(MELODY), length(BASS)) + LOOP_PAUSE_SECONDS;
}

type SinkAwareContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

// Starts ringing; call the returned function to stop. `sinkId` picks the speaker (Settings -> Audio).
export function startRinging(sinkId?: string): () => void {
    if (typeof window === "undefined" || !window.AudioContext) {
        return () => undefined;
    }
    const context = new AudioContext() as SinkAwareContext;
    if (sinkId && sinkId !== "default") {
        void context.setSinkId?.(sinkId).catch(() => undefined);
    }
    const output = context.createGain();
    output.connect(context.destination);
    let stopped = false;
    let nextStart = context.currentTime + 0.05;
    const loop = ringtoneLoopSeconds();
    const scheduleAhead = (): void => {
        while (!stopped && nextStart < context.currentTime + 2) {
            scheduleRingtone(context, output, nextStart);
            nextStart += loop;
        }
    };
    scheduleAhead();
    const timer = window.setInterval(scheduleAhead, 500);
    // Browsers may refuse to start audio until the page has been clicked: start ringing on the next interaction.
    const resumeOnInteraction = (): void => {
        void context.resume().catch(() => undefined);
    };
    void context.resume().catch(() => undefined);
    window.addEventListener("pointerdown", resumeOnInteraction, true);
    window.addEventListener("keydown", resumeOnInteraction, true);
    return () => {
        if (stopped) return;
        stopped = true;
        window.removeEventListener("pointerdown", resumeOnInteraction, true);
        window.removeEventListener("keydown", resumeOnInteraction, true);
        window.clearInterval(timer);
        output.gain.setTargetAtTime(0, context.currentTime, 0.03);
        window.setTimeout(() => void context.close().catch(() => undefined), 200);
    };
}
