// SPDX-License-Identifier: AGPL-3.0-only
// Renders a test voice (a gliding tone with a syllable-like envelope) through every voice changer effect in an
// offline audio context, and reports each one's level, for the voice effects test.
import { VOICE_EFFECTS, buildVoiceEffect } from "../../src/ui/voice/voiceChanger";

const SECONDS = 1.5;
const RATE = 48_000;

async function render(effect: (typeof VOICE_EFFECTS)[number]["id"]): Promise<{ id: string; rms: number; peak: number; finite: boolean }> {
    const context = new OfflineAudioContext(1, Math.round(SECONDS * RATE), RATE);
    const voice = context.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(140, 0);
    voice.frequency.linearRampToValueAtTime(220, SECONDS);
    const syllables = context.createGain();
    syllables.gain.value = 0;
    for (let start = 0; start < SECONDS; start += 0.25) {
        syllables.gain.setValueAtTime(0, start);
        syllables.gain.linearRampToValueAtTime(0.4, start + 0.03);
        syllables.gain.linearRampToValueAtTime(0, start + 0.2);
    }
    const chain = buildVoiceEffect(context, effect);
    voice.connect(syllables).connect(chain.input);
    chain.output.connect(context.destination);
    voice.start();
    const samples = (await context.startRendering()).getChannelData(0);
    let sum = 0;
    let peak = 0;
    let finite = true;
    for (const sample of samples) {
        if (!Number.isFinite(sample)) finite = false;
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
    }
    chain.dispose();
    return { id: effect, rms: Math.sqrt(sum / samples.length), peak, finite };
}

(window as unknown as { voiceEffectLevels: Promise<unknown> }).voiceEffectLevels = Promise.all(VOICE_EFFECTS.map((effect) => render(effect.id)));
