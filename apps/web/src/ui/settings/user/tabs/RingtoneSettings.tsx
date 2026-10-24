// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Notifications → Ringtone: like the message sound, for incoming calls. Ring or not, Meadhall's jingle or
// your own sound (kept on this device), and a test that plays it until you stop it.
import React, { useEffect, useRef, useState } from "react";

import type { NotificationsSettings } from "../settingsStore";
import { startRinging } from "../../../voice/ringtone";

// Kept in local storage with the other settings, so keep it small.
const MAX_RINGTONE_BYTES = 1024 * 1024;

interface RingtoneSettingsProps {
    settings: NotificationsSettings;
    speakerId?: string;
    onChange: (settings: NotificationsSettings) => void;
}

export function RingtoneSettings({ settings, speakerId, onChange }: RingtoneSettingsProps): React.ReactElement {
    const uploadRef = useRef<HTMLInputElement | null>(null);
    const stopRef = useRef<(() => void) | null>(null);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => () => stopRef.current?.(), []);

    const stopTest = (): void => {
        stopRef.current?.();
        stopRef.current = null;
        setTesting(false);
    };

    const test = (): void => {
        if (testing) return stopTest();
        setError(null);
        stopRef.current = startRinging(speakerId, settings.customRingtoneDataUrl);
        setTesting(true);
    };

    const choose = (file: File | undefined): void => {
        if (!file) return;
        if (!file.type.startsWith("audio/")) return setError("Pick an audio file (MP3, OGG, WAV...).");
        if (file.size > MAX_RINGTONE_BYTES) return setError("Ringtones can be up to 1 MB. Try a shorter clip.");
        setError(null);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = typeof reader.result === "string" ? reader.result : null;
            if (!dataUrl?.startsWith("data:audio/")) return setError("Couldn't read that sound.");
            stopTest();
            onChange({ ...settings, customRingtoneDataUrl: dataUrl, customRingtoneName: file.name });
        };
        reader.onerror = () => setError("Couldn't read that sound.");
        reader.readAsDataURL(file);
    };

    return (
        <div className="settings-section-card" data-testid="ringtone-settings">
            <h3>Ringtone</h3>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.ringtoneEnabled}
                    onChange={(event) => {
                        if (!event.target.checked) stopTest();
                        onChange({ ...settings, ringtoneEnabled: event.target.checked });
                    }}
                    data-testid="ringtone-toggle"
                />
                Ring for incoming calls (the call card still shows when off)
            </label>
            <p className="settings-inline-note">Current: {settings.customRingtoneName && settings.customRingtoneDataUrl ? settings.customRingtoneName : "Meadhall jingle (default)"}</p>
            <input
                ref={uploadRef}
                type="file"
                accept="audio/*"
                className="settings-hidden-input"
                aria-label="Upload custom ringtone"
                onChange={(event) => {
                    choose(event.target.files?.[0]);
                    event.currentTarget.value = "";
                }}
            />
            <div className="settings-actions-row">
                <button type="button" className="settings-button settings-button-secondary" onClick={() => uploadRef.current?.click()}>
                    Browse audio file
                </button>
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    onClick={() => {
                        stopTest();
                        onChange({ ...settings, customRingtoneDataUrl: null, customRingtoneName: null });
                    }}
                    disabled={!settings.customRingtoneDataUrl}
                >
                    Use default
                </button>
                <button type="button" className="settings-button" onClick={test} data-testid="ringtone-test">
                    {testing ? "Stop" : "Test ringtone"}
                </button>
            </div>
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}
