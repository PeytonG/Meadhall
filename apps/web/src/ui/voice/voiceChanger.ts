// SPDX-License-Identifier: AGPL-3.0-only
// Voice changer: Web Audio effects applied to the microphone before it is sent (a livekit TrackProcessor), so
// everyone in the call, Element users included, hears the changed voice. Built from standard nodes only (no
// AudioWorklet), so it runs in the desktop app, browsers and the Android WebView.
//
// Pitch shifting uses two delay lines whose delay time ramps steadily: a delay that grows at rate r plays audio
// back at (1 - r) times its speed, which shifts the pitch. Each ramp has to jump back once per cycle, so the two
// lines run half a cycle apart and cross-fade, and each is silent at its own jump.
import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from "livekit-client";

export type VoiceEffect = "off" | "giant" | "pixie" | "robot" | "hall" | "radio" | "troll";

export const VOICE_EFFECTS: ReadonlyArray<{ id: VoiceEffect; label: string; description: string }> = [
    { id: "off", label: "Off", description: "Your normal voice" },
    { id: "giant", label: "Giant", description: "Deep and slow" },
    { id: "pixie", label: "Pixie", description: "High and squeaky" },
    { id: "robot", label: "Robot", description: "Metallic, ring-modulated" },
    { id: "hall", label: "Great hall", description: "Echoes off stone walls" },
    { id: "radio", label: "Radio", description: "Thin, crackly walkie-talkie" },
    { id: "troll", label: "Troll", description: "Very deep and gravelly" },
];

export function normalizeVoiceEffect(value: unknown): VoiceEffect {
    return VOICE_EFFECTS.some((effect) => effect.id === value) ? (value as VoiceEffect) : "off";
}

// Pitch factor per effect (1 = unchanged).
export function pitchFactorFor(effect: VoiceEffect): number {
    switch (effect) {
        case "giant":
            return 0.72;
        case "pixie":
            return 1.5;
        case "troll":
            return 0.58;
        default:
            return 1;
    }
}

export interface VoiceEffectChain {
    input: AudioNode;
    output: AudioNode;
    dispose: () => void;
}

const PITCH_CYCLE_SECONDS = 0.1;

function buildRampBuffers(context: BaseAudioContext): { ramp: AudioBuffer; window: AudioBuffer } {
    const length = Math.max(2, Math.round(PITCH_CYCLE_SECONDS * context.sampleRate));
    const ramp = context.createBuffer(1, length, context.sampleRate);
    const window = context.createBuffer(1, length, context.sampleRate);
    const rampData = ramp.getChannelData(0);
    const windowData = window.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
        const phase = index / length;
        rampData[index] = phase;
        // Triangle: silent where the ramp jumps (phase 0 / 1); two lines half a cycle apart sum to 1.
        windowData[index] = 1 - Math.abs(2 * phase - 1);
    }
    return { ramp, window };
}

function buildPitchShifter(context: BaseAudioContext, factor: number, sources: AudioScheduledSourceNode[]): VoiceEffectChain {
    const input = context.createGain();
    const output = context.createGain();
    const { ramp, window } = buildRampBuffers(context);
    // Delay sweep per cycle: grows (pitch down) or shrinks (pitch up) by |1 - factor| of the cycle.
    const sweep = Math.abs(1 - factor) * PITCH_CYCLE_SECONDS;
    const startAt = context.currentTime + 0.01;

    for (const offset of [0, PITCH_CYCLE_SECONDS / 2]) {
        const delay = context.createDelay(1);
        delay.delayTime.value = factor > 1 ? sweep : 0;
        const rampSource = context.createBufferSource();
        rampSource.buffer = ramp;
        rampSource.loop = true;
        const rampDepth = context.createGain();
        rampDepth.gain.value = factor > 1 ? -sweep : sweep;
        rampSource.connect(rampDepth).connect(delay.delayTime);

        const fade = context.createGain();
        fade.gain.value = 0;
        const windowSource = context.createBufferSource();
        windowSource.buffer = window;
        windowSource.loop = true;
        windowSource.connect(fade.gain);

        input.connect(delay).connect(fade).connect(output);
        rampSource.start(startAt, offset);
        windowSource.start(startAt, offset);
        sources.push(rampSource, windowSource);
    }
    return { input, output, dispose: () => undefined };
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    for (let index = 0; index < samples; index += 1) {
        const x = (index * 2) / samples - 1;
        curve[index] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
}

// Builds the effect between `input` and `output`. "off" is a straight wire.
export function buildVoiceEffect(context: BaseAudioContext, effect: VoiceEffect): VoiceEffectChain {
    const sources: AudioScheduledSourceNode[] = [];
    const input = context.createGain();
    const output = context.createGain();
    let tail: AudioNode = input;

    const factor = pitchFactorFor(effect);
    if (factor !== 1) {
        const shifter = buildPitchShifter(context, factor, sources);
        tail.connect(shifter.input);
        tail = shifter.output;
        if (factor > 1) {
            // Pitching up loses about 40% of the level in the cross-fade (measured); make it up.
            const makeUp = context.createGain();
            makeUp.gain.value = 1.7;
            tail.connect(makeUp);
            tail = makeUp;
        }
    }

    switch (effect) {
        case "robot": {
            // Ring modulation: the voice multiplied by a 55 Hz sine.
            const modulated = context.createGain();
            modulated.gain.value = 0;
            const carrier = context.createOscillator();
            carrier.frequency.value = 55;
            carrier.connect(modulated.gain);
            carrier.start();
            sources.push(carrier);
            tail.connect(modulated);
            const level = context.createGain();
            level.gain.value = 1.6;
            modulated.connect(level);
            tail = level;
            break;
        }
        case "hall": {
            const echo = context.createDelay(1);
            echo.delayTime.value = 0.22;
            const feedback = context.createGain();
            feedback.gain.value = 0.38;
            const tone = context.createBiquadFilter();
            tone.type = "lowpass";
            tone.frequency.value = 2800;
            const mix = context.createGain();
            tail.connect(mix);
            tail.connect(echo);
            echo.connect(tone).connect(feedback).connect(echo);
            tone.connect(mix);
            tail = mix;
            break;
        }
        case "radio": {
            const highpass = context.createBiquadFilter();
            highpass.type = "highpass";
            highpass.frequency.value = 450;
            const lowpass = context.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.value = 3200;
            const crunch = context.createWaveShaper();
            crunch.curve = distortionCurve(12);
            tail.connect(highpass).connect(lowpass).connect(crunch);
            tail = crunch;
            break;
        }
        case "troll": {
            const growl = context.createWaveShaper();
            growl.curve = distortionCurve(6);
            tail.connect(growl);
            tail = growl;
            break;
        }
        default:
            break;
    }

    tail.connect(output);
    return {
        input,
        output,
        dispose: () => {
            for (const source of sources) {
                try {
                    source.stop();
                } catch {
                    // Already stopped.
                }
            }
            input.disconnect();
            output.disconnect();
        },
    };
}

// A livekit processor that runs the microphone through an effect before it is published. livekit re-runs
// `restart` when the mic track is restarted (device or processing change), so the effect survives those.
export function createVoiceChangerProcessor(effect: VoiceEffect): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    let chain: VoiceEffectChain | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;

    const teardown = (): void => {
        chain?.dispose();
        source?.disconnect();
        chain = null;
        source = null;
        destination = null;
    };

    const processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
        name: `meadhall-voice-${effect}`,
        processedTrack: undefined,
        init: async ({ track, audioContext }) => {
            teardown();
            if (audioContext.state === "suspended") {
                await audioContext.resume().catch(() => undefined);
            }
            source = audioContext.createMediaStreamSource(new MediaStream([track]));
            destination = audioContext.createMediaStreamDestination();
            chain = buildVoiceEffect(audioContext, effect);
            source.connect(chain.input);
            chain.output.connect(destination);
            processor.processedTrack = destination.stream.getAudioTracks()[0];
        },
        restart: async (options) => {
            await processor.init(options);
        },
        destroy: async () => {
            teardown();
            processor.processedTrack = undefined;
        },
    };
    return processor;
}

let processorContext: AudioContext | null = null;

// Puts the effect on (or takes it off) a published microphone track, live: no rejoin needed.
export async function applyVoiceEffect(track: LocalAudioTrack, effect: VoiceEffect): Promise<void> {
    const current = track.getProcessor()?.name;
    if (effect === "off") {
        if (current?.startsWith("meadhall-voice-")) {
            await track.stopProcessor();
        }
        return;
    }
    if (current === `meadhall-voice-${effect}`) {
        return;
    }
    processorContext ??= new AudioContext();
    track.setAudioContext(processorContext);
    await track.setProcessor(createVoiceChangerProcessor(effect));
}
