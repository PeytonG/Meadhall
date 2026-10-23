// SPDX-License-Identifier: AGPL-3.0-only
// Every voice changer effect, run in Chromium's real Web Audio on a 220 Hz tone (offline, faster than real time):
// none may go silent, blow up or leave the voice unchanged, and the pitch effects must land on their pitch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { transformWithEsbuild } from "vite";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/voice/voiceChanger.ts");

interface Measured {
    id: string;
    rms: number;
    peak: number;
    finite: boolean;
    differenceFromDry: number;
    frequency: number;
}

test("every voice effect changes the voice without silencing or blowing it up", async ({ page }) => {
    const { code } = await transformWithEsbuild(fs.readFileSync(source, "utf8"), source, { loader: "ts", format: "esm" });
    const script = `${code.replace(/^export /gm, "")}\nwindow.voiceChanger = { buildVoiceEffect, VOICE_EFFECTS, pitchFactorFor };`;
    await page.setContent("<!doctype html><title>voice effects</title>");
    await page.addScriptTag({ content: script });

    const results: Measured[] = await page.evaluate(async () => {
        const { buildVoiceEffect, VOICE_EFFECTS } = (window as unknown as {
            voiceChanger: {
                buildVoiceEffect: (context: BaseAudioContext, effect: string) => { input: AudioNode; output: AudioNode };
                VOICE_EFFECTS: Array<{ id: string }>;
            };
        }).voiceChanger;
        const rate = 48_000;
        const render = async (effect: string): Promise<Float32Array> => {
            const context = new OfflineAudioContext(1, rate * 2, rate);
            const tone = context.createOscillator();
            tone.frequency.value = 220;
            const level = context.createGain();
            level.gain.value = 0.5;
            const chain = buildVoiceEffect(context, effect);
            tone.connect(level).connect(chain.input);
            chain.output.connect(context.destination);
            tone.start();
            return (await context.startRendering()).getChannelData(0).slice(rate); // the second second: settled
        };
        const dry = await render("off");
        const measured = [];
        for (const { id } of VOICE_EFFECTS) {
            const wet = await render(id);
            let sum = 0;
            let peak = 0;
            let difference = 0;
            let crossings = 0;
            let finite = true;
            for (let index = 0; index < wet.length; index += 1) {
                const value = wet[index];
                if (!Number.isFinite(value)) finite = false;
                sum += value * value;
                peak = Math.max(peak, Math.abs(value));
                difference += (value - dry[index]) ** 2;
                if (index > 0 && wet[index - 1] < 0 && value >= 0) crossings += 1;
            }
            measured.push({
                id,
                rms: Math.sqrt(sum / wet.length),
                peak,
                finite,
                differenceFromDry: Math.sqrt(difference / wet.length),
                frequency: crossings / (wet.length / rate),
            });
        }
        return measured;
    });

    expect(results.length).toBeGreaterThanOrEqual(19);
    const dryRms = results.find((result) => result.id === "off")!.rms;
    for (const result of results) {
        expect(result.finite, result.id).toBe(true);
        expect(result.rms, `${result.id} is audible`).toBeGreaterThan(dryRms * 0.25);
        expect(result.peak, `${result.id} doesn't blow up`).toBeLessThan(1.2);
        if (result.id !== "off") expect(result.differenceFromDry, `${result.id} changes the voice`).toBeGreaterThan(0.02);
    }
    // Clean pitch effects land within 8% of their target (220 Hz times the factor).
    const expected: Record<string, number> = { giant: 0.72, pixie: 1.5, troll: 0.58, chipmunk: 1.9, dwarf: 0.86 };
    for (const [id, factor] of Object.entries(expected)) {
        const result = results.find((candidate) => candidate.id === id)!;
        expect(Math.abs(result.frequency / (220 * factor) - 1), `${id}: ${result.frequency.toFixed(0)} Hz`).toBeLessThan(0.08);
    }
});

test("soundboard sounds are mixed into the processed microphone and count as you speaking", async ({ page }) => {
    const load = async (file: string, names: string[]): Promise<string> => {
        const fullPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), file);
        const { code } = await transformWithEsbuild(fs.readFileSync(fullPath, "utf8"), fullPath, { loader: "ts", format: "esm" });
        return `${code.replace(/^export /gm, "")}\nObject.assign(window, { ${names.join(", ")} });`;
    };
    await page.setContent("<!doctype html><title>mixer</title>");
    // Separate scripts: each file is its own scope, like modules.
    await page.addScriptTag({ content: `(() => {${await load("../src/ui/voice/voiceChanger.ts", ["createVoiceChangerProcessor", "soundboardBus"])}})();` });
    await page.addScriptTag({ content: `(() => {${await load("../src/ui/voice/soundboard/builtinSounds.ts", ["renderBuiltinSound"])}})();` });
    await page.addScriptTag({ content: `(() => {${await load("../src/ui/voice/voiceActivity.ts", ["VoiceActivityMonitor"])}})();` });

    const result = await page.evaluate(async () => {
        const w = window as unknown as {
            createVoiceChangerProcessor: (effect: string) => {
                init: (options: { track: MediaStreamTrack; audioContext: AudioContext }) => Promise<void>;
                processedTrack?: MediaStreamTrack;
            };
            soundboardBus: (context: BaseAudioContext) => AudioNode;
            renderBuiltinSound: (id: string, sampleRate: number) => Promise<AudioBuffer>;
            VoiceActivityMonitor: new (onChange: () => void) => { track: (key: string, track: MediaStreamTrack) => void; isSpeaking: (key: string) => boolean };
        };
        const context = new AudioContext();
        await context.resume();
        // A silent microphone.
        const silence = context.createConstantSource();
        silence.offset.value = 0;
        const micOut = context.createMediaStreamDestination();
        silence.connect(micOut);
        silence.start();
        const processor = w.createVoiceChangerProcessor("off");
        await processor.init({ track: micOut.stream.getAudioTracks()[0], audioContext: context });

        // Measure what the call would receive, and run the speaking detector on it.
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(new MediaStream([processor.processedTrack!])).connect(analyser);
        const monitor = new w.VoiceActivityMonitor(() => undefined);
        monitor.track("me", processor.processedTrack!);
        const level = (): number => {
            const samples = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(samples);
            return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        };
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        await wait(300);
        const before = { level: level(), speaking: monitor.isSpeaking("me") };

        const sound = context.createBufferSource();
        sound.buffer = await w.renderBuiltinSound("airhorn", context.sampleRate);
        sound.connect(w.soundboardBus(context));
        sound.start();
        let peak = 0;
        let speaking = false;
        for (let step = 0; step < 20; step += 1) {
            await wait(50);
            peak = Math.max(peak, level());
            speaking ||= monitor.isSpeaking("me");
        }
        return { before, peak, speaking };
    });
    expect(result.before.level).toBeLessThan(0.001);
    expect(result.before.speaking).toBe(false);
    expect(result.peak).toBeGreaterThan(0.02);
    expect(result.speaking).toBe(true);
});
