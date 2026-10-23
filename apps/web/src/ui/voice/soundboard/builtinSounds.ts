// SPDX-License-Identifier: AGPL-3.0-only
// The soundboard's built-in sounds, synthesized in the browser in a chunky 8-bit style that matches Meadhall's
// pixel look. Nothing is downloaded and there are no sample licenses to worry about: each sound is a small Web
// Audio graph rendered once into a buffer.

export interface BuiltinSound {
    id: string;
    name: string;
    emoji: string;
    seconds: number;
    build: (context: BaseAudioContext) => void;
}

function noiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
    const buffer = context.createBuffer(1, Math.max(1, Math.round(seconds * context.sampleRate)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
}

// A gain that rises to `peak` in `attack` seconds at `start` and falls to silence by `end`.
function envelope(context: BaseAudioContext, start: number, attack: number, peak: number, end: number): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    return gain;
}

function tone(
    context: BaseAudioContext,
    type: OscillatorType,
    frequency: number,
    start: number,
    end: number,
    peak: number,
    options: { attack?: number; glideTo?: number; destination?: AudioNode } = {},
): OscillatorNode {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (options.glideTo) oscillator.frequency.exponentialRampToValueAtTime(options.glideTo, end);
    oscillator.connect(envelope(context, start, options.attack ?? 0.005, peak, end)).connect(options.destination ?? context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
    return oscillator;
}

function noise(
    context: BaseAudioContext,
    start: number,
    end: number,
    peak: number,
    filterType: BiquadFilterType,
    frequency: number,
    q = 1,
): BiquadFilterNode {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, end - start + 0.05);
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter).connect(envelope(context, start, 0.003, peak, end)).connect(context.destination);
    source.start(start);
    return filter;
}

export const BUILTIN_SOUNDS: ReadonlyArray<BuiltinSound> = [
    {
        id: "duck",
        name: "Duck",
        emoji: "🦆",
        seconds: 0.75,
        build: (context) => {
            // Two nasal quacks: a buzzy sawtooth through a narrow "beak" formant, pitch dropping.
            for (const start of [0, 0.36]) {
                const beak = context.createBiquadFilter();
                beak.type = "bandpass";
                beak.frequency.value = 1100;
                beak.Q.value = 3;
                beak.connect(context.destination);
                tone(context, "sawtooth", 520, start, start + 0.3, 0.9, { glideTo: 330, destination: beak });
            }
        },
    },
    {
        id: "fart",
        name: "Fart",
        emoji: "💨",
        seconds: 1.1,
        build: (context) => {
            // A low square wave whose pitch flutters, through a muffling lowpass.
            const muffle = context.createBiquadFilter();
            muffle.type = "lowpass";
            muffle.frequency.value = 420;
            muffle.connect(context.destination);
            const oscillator = tone(context, "square", 95, 0, 1.0, 0.8, { glideTo: 55, attack: 0.03, destination: muffle });
            const flutter = context.createOscillator();
            flutter.frequency.value = 23;
            const depth = context.createGain();
            depth.gain.value = 22;
            flutter.connect(depth).connect(oscillator.frequency);
            flutter.start(0);
            flutter.stop(1.0);
        },
    },
    {
        id: "sword",
        name: "Sword",
        emoji: "⚔️",
        seconds: 1.0,
        build: (context) => {
            // Draw (a hiss sweeping up) then a ringing metallic shing.
            const sweep = noise(context, 0, 0.25, 0.5, "bandpass", 2000, 2);
            sweep.frequency.exponentialRampToValueAtTime(7000, 0.25);
            for (const [frequency, level] of [[2637, 0.25], [3951, 0.18], [5274, 0.12]] as const) {
                tone(context, "triangle", frequency, 0.2, 0.95, level);
            }
        },
    },
    {
        id: "airhorn",
        name: "Air horn",
        emoji: "📯",
        seconds: 1.6,
        build: (context) => {
            // The classic: three blasts of a brassy sawtooth chord.
            for (const [start, end] of [[0, 0.22], [0.27, 0.49], [0.55, 1.5]]) {
                for (const frequency of [349, 440, 523]) tone(context, "sawtooth", frequency, start, end, 0.22, { attack: 0.02 });
            }
        },
    },
    {
        id: "rimshot",
        name: "Ba dum tss",
        emoji: "🥁",
        seconds: 1.3,
        build: (context) => {
            tone(context, "sine", 180, 0, 0.18, 0.9, { glideTo: 60 });
            tone(context, "sine", 160, 0.2, 0.4, 0.9, { glideTo: 55 });
            noise(context, 0.45, 1.25, 0.6, "highpass", 6000);
        },
    },
    {
        id: "coin",
        name: "Coin",
        emoji: "🪙",
        seconds: 0.5,
        build: (context) => {
            tone(context, "square", 988, 0, 0.08, 0.35);
            tone(context, "square", 1319, 0.08, 0.45, 0.35);
        },
    },
    {
        id: "bell",
        name: "Bell",
        emoji: "🔔",
        seconds: 2.0,
        build: (context) => {
            // Inharmonic partials, like a real bell.
            for (const [ratio, level] of [[1, 0.4], [2.76, 0.22], [5.4, 0.12], [8.93, 0.06]] as const) {
                tone(context, "sine", 523 * ratio, 0, 1.9, level);
            }
        },
    },
    {
        id: "warhorn",
        name: "War horn",
        emoji: "🐂",
        seconds: 2.2,
        build: (context) => {
            const warm = context.createBiquadFilter();
            warm.type = "lowpass";
            warm.frequency.value = 900;
            warm.connect(context.destination);
            tone(context, "sawtooth", 98, 0, 0.7, 0.6, { attack: 0.15, destination: warm });
            tone(context, "sawtooth", 147, 0.65, 2.1, 0.6, { attack: 0.15, destination: warm });
        },
    },
    {
        id: "sad",
        name: "Sad trombone",
        emoji: "😢",
        seconds: 2.4,
        build: (context) => {
            const notes: Array<[number, number, number]> = [[294, 0, 0.4], [277, 0.45, 0.85], [262, 0.9, 1.3], [247, 1.35, 2.3]];
            for (const [frequency, start, end] of notes) {
                const oscillator = tone(context, "sawtooth", frequency, start, end, 0.35, { attack: 0.04 });
                if (end > 2) {
                    const wobble = context.createOscillator();
                    wobble.frequency.value = 6;
                    const depth = context.createGain();
                    depth.gain.value = 6;
                    wobble.connect(depth).connect(oscillator.frequency);
                    wobble.start(start);
                    wobble.stop(end);
                }
            }
        },
    },
    {
        id: "applause",
        name: "Applause",
        emoji: "👏",
        seconds: 2.0,
        build: (context) => {
            for (let clap = 0; clap < 40; clap += 1) {
                const start = Math.random() * 1.6;
                noise(context, start, start + 0.06, 0.25, "bandpass", 1200 + Math.random() * 1500, 1.5);
            }
        },
    },
    {
        id: "crickets",
        name: "Crickets",
        emoji: "🦗",
        seconds: 2.2,
        build: (context) => {
            for (let chirp = 0; chirp < 6; chirp += 1) {
                for (let pulse = 0; pulse < 3; pulse += 1) {
                    const start = chirp * 0.36 + pulse * 0.045;
                    tone(context, "sine", 4400, start, start + 0.03, 0.25);
                }
            }
        },
    },
    {
        id: "levelup",
        name: "Level up",
        emoji: "⭐",
        seconds: 0.9,
        build: (context) => {
            [523, 659, 784, 1047].forEach((frequency, index) => tone(context, "square", frequency, index * 0.09, index * 0.09 + 0.3, 0.25));
            tone(context, "square", 1319, 0.36, 0.85, 0.25);
        },
    },
];

const cache = new Map<string, Promise<AudioBuffer>>();

// Renders a built-in sound to a buffer (once per sample rate).
export function renderBuiltinSound(id: string, sampleRate = 48_000): Promise<AudioBuffer> {
    const key = `${id}@${sampleRate}`;
    let rendered = cache.get(key);
    if (!rendered) {
        const sound = BUILTIN_SOUNDS.find((candidate) => candidate.id === id);
        if (!sound) return Promise.reject(new Error(`Unknown sound ${id}`));
        const context = new OfflineAudioContext(1, Math.round(sound.seconds * sampleRate), sampleRate);
        sound.build(context);
        rendered = context.startRendering();
        cache.set(key, rendered);
    }
    return rendered;
}
