// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Notifications → Notification sounds: which sound plays for messages, mentions and direct messages. A
// built-in tone (notifications/notificationTones.ts) or your own file; mentions and DMs can follow messages.
import React, { useRef, useState } from "react";

import type { NotificationsSettings } from "../settingsStore";
import { NOTIFICATION_TONES, playTone, soundFor, type NotificationKind } from "../../../notifications/notificationTones";
import { playNotificationSound } from "../../../notifications/sound";

// Own sounds are kept in settings, so they're kept short.
const MAX_SOUND_BYTES = 1024 * 1024;

const SLOTS: Array<{ kind: NotificationKind; label: string; tone: "messageTone" | "mentionTone" | "dmTone"; file: "customMessageSoundDataUrl" | "mentionSoundDataUrl" | "dmSoundDataUrl"; name: "customMessageSoundName" | "mentionSoundName" | "dmSoundName" }> = [
    { kind: "message", label: "Messages", tone: "messageTone", file: "customMessageSoundDataUrl", name: "customMessageSoundName" },
    { kind: "mention", label: "Mentions and replies to you", tone: "mentionTone", file: "mentionSoundDataUrl", name: "mentionSoundName" },
    { kind: "direct", label: "Direct messages", tone: "dmTone", file: "dmSoundDataUrl", name: "dmSoundName" },
];

export function NotificationSoundsCard({ settings, onChange }: { settings: NotificationsSettings; onChange: (settings: NotificationsSettings) => void }): React.ReactElement {
    const [error, setError] = useState<string | null>(null);
    const uploadFor = useRef<(typeof SLOTS)[number] | null>(null);
    const fileInput = useRef<HTMLInputElement | null>(null);

    const preview = (kind: NotificationKind, next: NotificationsSettings = settings): void => {
        const sound = soundFor(next, kind);
        void (sound.file ? playNotificationSound(sound.file) : playTone(sound.tone)).catch((playError: unknown) =>
            setError(playError instanceof Error ? playError.message : "Couldn't play the sound."),
        );
    };

    const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        const slot = uploadFor.current;
        event.target.value = "";
        if (!file || !slot) return;
        if (!file.type.startsWith("audio/")) {
            setError("That isn't an audio file.");
            return;
        }
        if (file.size > MAX_SOUND_BYTES) {
            setError("Pick a sound under 1 MB (a short clip).");
            return;
        }
        setError(null);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : null;
            if (!dataUrl?.startsWith("data:audio/")) {
                setError("Couldn't read that sound.");
                return;
            }
            const next = { ...settings, [slot.tone]: "custom", [slot.file]: dataUrl, [slot.name]: file.name.slice(0, 80) };
            onChange(next);
            preview(slot.kind, next);
        };
        reader.onerror = () => setError("Couldn't read that sound.");
        reader.readAsDataURL(file);
    };

    return (
        <div className="settings-section-card" data-testid="notification-sounds">
            <h3>Notification sounds</h3>
            <input ref={fileInput} type="file" accept="audio/*" className="settings-hidden-input" onChange={onFile} aria-label="Upload a notification sound" />
            {SLOTS.map((slot) => {
                const value = settings[slot.tone];
                const fileName = settings[slot.name];
                return (
                    <div key={slot.kind} className="notification-sound-row">
                        <label className="settings-field">
                            {slot.label}
                            <select
                                value={value}
                                onChange={(event) => {
                                    const tone = event.target.value;
                                    if (tone === "custom" && !settings[slot.file]) {
                                        uploadFor.current = slot;
                                        fileInput.current?.click();
                                        return;
                                    }
                                    const next = { ...settings, [slot.tone]: tone };
                                    onChange(next);
                                    if (tone !== "same") preview(slot.kind, next);
                                }}
                                aria-label={`${slot.label} sound`}
                            >
                                {slot.kind !== "message" ? <option value="same">Same as messages</option> : null}
                                {NOTIFICATION_TONES.map((tone) => (
                                    <option key={tone.id} value={tone.id}>
                                        {tone.label}
                                    </option>
                                ))}
                                <option value="custom">{fileName && settings[slot.file] ? `Your sound: ${fileName}` : "Your own sound…"}</option>
                            </select>
                        </label>
                        <span className="settings-actions-row">
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => preview(slot.kind)} aria-label={`Preview ${slot.label.toLowerCase()} sound`}>
                                Preview
                            </button>
                            <button
                                type="button"
                                className="settings-button settings-button-secondary"
                                onClick={() => {
                                    uploadFor.current = slot;
                                    fileInput.current?.click();
                                }}
                            >
                                {settings[slot.file] ? "Change file" : "Use a file"}
                            </button>
                        </span>
                    </div>
                );
            })}
            <p className="settings-field-help">Built-in sounds follow the sound style below (8-bit or smooth). Your own sounds can be up to 1 MB.</p>
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}
