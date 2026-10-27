let activeAudio: HTMLAudioElement | null = null;
import { getSoundStyle, leadWave, shapeNote, softWave } from "./soundStyle";

function stopActiveAudio(): void {
    if (!activeAudio) {
        return;
    }

    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
}

function getAudioContext(): AudioContext | null {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    return new AudioContextCtor();
}

function makeOscillator(
    context: AudioContext,
    frequency: number,
    start: number,
    end: number,
    peak = 0.08,
    type: OscillatorType = softWave(),
): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.0001;

    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.start(start);
    oscillator.stop(end + 0.01);
}

// The message sound: two quick rising notes. 8-bit (square) or smooth (sine bell), same notes (Settings → Notifications).
function playDefaultTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();
    const start = context.currentTime + 0.01;
    for (const [index, frequency] of [880, 1318.5].entries()) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = leadWave();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain).connect(context.destination);
        const at = start + index * 0.09;
        shapeNote(gain.gain, at, 0.12, getSoundStyle() === "smooth" ? 0.22 : 0.07);
        oscillator.start(at);
        oscillator.stop(at + 0.45);
        if (index === 1) {
            return new Promise<void>((resolve) => {
                oscillator.onended = () => {
                    void context.close().catch(() => undefined);
                    resolve();
                };
            });
        }
    }
    return Promise.resolve();
}

function playVoiceJoinTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const now = context.currentTime;
    makeOscillator(context, 660, now, now + 0.11);
    makeOscillator(context, 880, now + 0.09, now + 0.24);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 300);
    });
}

function playVoiceLeaveTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const now = context.currentTime;
    makeOscillator(context, 880, now, now + 0.11);
    makeOscillator(context, 660, now + 0.09, now + 0.24);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 300);
    });
}

function playParticipantJoinTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.linearRampToValueAtTime(780, now + 0.12);
    gain.gain.value = 0.0001;

    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    oscillator.start(now);
    oscillator.stop(now + 0.15);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 200);
    });
}

function playParticipantLeaveTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(780, now);
    oscillator.frequency.linearRampToValueAtTime(520, now + 0.12);
    gain.gain.value = 0.0001;

    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    oscillator.start(now);
    oscillator.stop(now + 0.15);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 200);
    });
}

function playScreenShareStartTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const now = context.currentTime;
    makeOscillator(context, 440, now, now + 0.09, 0.06);
    makeOscillator(context, 660, now + 0.07, now + 0.16, 0.06);
    makeOscillator(context, 880, now + 0.13, now + 0.22, 0.06);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 280);
    });
}

function playScreenShareStopTone(): Promise<void> {
    const context = getAudioContext();
    if (!context) return Promise.resolve();

    const now = context.currentTime;
    makeOscillator(context, 660, now, now + 0.10, 0.06);
    makeOscillator(context, 440, now + 0.08, now + 0.18, 0.06);

    return new Promise<void>((resolve) => {
        window.setTimeout(() => {
            void context.close().catch(() => undefined);
            resolve();
        }, 240);
    });
}

export async function playNotificationSound(customSoundUrl: string | null): Promise<void> {
    stopActiveAudio();

    if (customSoundUrl) {
        const audio = new Audio(customSoundUrl);
        activeAudio = audio;
        audio.preload = "auto";
        audio.currentTime = 0;
        await audio.play();
        return;
    }

    await playDefaultTone();
}

export async function playVoiceJoinSound(): Promise<void> {
    stopActiveAudio();
    await playVoiceJoinTone();
}

export async function playVoiceLeaveSound(): Promise<void> {
    stopActiveAudio();
    await playVoiceLeaveTone();
}

export async function playParticipantJoinSound(): Promise<void> {
    await playParticipantJoinTone();
}

export async function playParticipantLeaveSound(): Promise<void> {
    await playParticipantLeaveTone();
}

export async function playScreenShareStartSound(): Promise<void> {
    await playScreenShareStartTone();
}

export async function playScreenShareStopSound(): Promise<void> {
    await playScreenShareStopTone();
}
