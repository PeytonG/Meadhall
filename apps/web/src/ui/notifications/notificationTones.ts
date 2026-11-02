// SPDX-License-Identifier: AGPL-3.0-only
// Notification sounds to choose from (Settings → Notifications), played in the 8-bit or smooth style like every other
// Meadhall tune, and which one plays for a message, a mention or a direct message.
import { leadWave, getSoundStyle, shapeNote } from "./soundStyle";
import type { NotificationsSettings } from "../settings/user/settingsStore";

// [frequency in Hz, start in seconds, length in seconds]
type Note = [number, number, number];

export interface NotificationTone {
    id: string;
    label: string;
    notes: Note[];
}

export const NOTIFICATION_TONES: NotificationTone[] = [
    { id: "chime", label: "Chime (default)", notes: [[880, 0, 0.12], [1318.5, 0.09, 0.12]] },
    { id: "blip", label: "Blip", notes: [[1046.5, 0, 0.08]] },
    { id: "coin", label: "Coin", notes: [[987.8, 0, 0.07], [1318.5, 0.07, 0.22]] },
    { id: "bell", label: "Bell", notes: [[1568, 0, 0.3]] },
    { id: "drop", label: "Drop", notes: [[1318.5, 0, 0.08], [880, 0.08, 0.08], [659.3, 0.16, 0.14]] },
    { id: "pop", label: "Pop", notes: [[587.3, 0, 0.05], [1174.7, 0.04, 0.06]] },
    { id: "knock", label: "Knock", notes: [[392, 0, 0.06], [392, 0.14, 0.06]] },
    { id: "rise", label: "Rise", notes: [[659.3, 0, 0.08], [880, 0.08, 0.08], [1174.7, 0.16, 0.08], [1568, 0.24, 0.16]] },
    { id: "ping", label: "Ping", notes: [[2093, 0, 0.1], [2093, 0.16, 0.06]] },
    { id: "hail", label: "Hail (horn)", notes: [[523.3, 0, 0.16], [659.3, 0.16, 0.16], [784, 0.32, 0.3]] },
];

export function toneById(id: string): NotificationTone {
    return NOTIFICATION_TONES.find((tone) => tone.id === id) ?? NOTIFICATION_TONES[0]!;
}

export async function playTone(id: string): Promise<void> {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const tone = toneById(id);
    const start = context.currentTime + 0.01;
    const level = getSoundStyle() === "smooth" ? 0.22 : 0.07;
    let last: OscillatorNode | null = null;
    let lastEnd = 0;
    for (const [frequency, offset, length] of tone.notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = leadWave();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain).connect(context.destination);
        shapeNote(gain.gain, start + offset, length, level);
        oscillator.start(start + offset);
        const end = start + offset + Math.max(length * 1.8, 0.3);
        oscillator.stop(end);
        if (end > lastEnd) {
            lastEnd = end;
            last = oscillator;
        }
    }
    await new Promise<void>((resolve) => {
        if (!last) return resolve();
        last.onended = () => resolve();
    });
    await context.close().catch(() => undefined);
}

export type NotificationKind = "message" | "mention" | "direct";

// What plays for a kind of notification: someone's own file, or a built-in tone. Mentions and DMs can use their own,
// or "same" as messages.
export function soundFor(settings: NotificationsSettings, kind: NotificationKind): { file: string | null; tone: string } {
    const slot =
        kind === "mention" && settings.mentionTone !== "same"
            ? { tone: settings.mentionTone, file: settings.mentionSoundDataUrl }
            : kind === "direct" && settings.dmTone !== "same"
              ? { tone: settings.dmTone, file: settings.dmSoundDataUrl }
              : { tone: settings.messageTone, file: settings.customMessageSoundDataUrl };
    return slot.tone === "custom" && slot.file ? { file: slot.file, tone: "chime" } : { file: null, tone: slot.tone === "custom" ? "chime" : slot.tone };
}
