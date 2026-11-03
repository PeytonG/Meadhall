import React, { useState } from "react";

import type { NotificationsSettings } from "../settingsStore";
import { NotificationSoundsCard } from "./NotificationSoundsCard";
import { RingtoneSettings } from "./RingtoneSettings";
import { setSoundStyle } from "../../../notifications/soundStyle";

interface NotificationsTabProps {
    settings: NotificationsSettings;
    onChange: (settings: NotificationsSettings) => void;
    // The speaker ringtone tests play on (Settings → Audio).
    speakerId?: string;
}

export function NotificationsTab({ settings, onChange, speakerId }: NotificationsTabProps): React.ReactElement {
    const [error, setError] = useState<string | null>(null);

    const desktopPermission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    const desktopEnabled = settings.notificationsEnabled;

    const setDesktopEnabled = async (enabled: boolean): Promise<void> => {
        setError(null);

        if (!enabled) {
            onChange({ ...settings, notificationsEnabled: false });
            return;
        }

        if (typeof Notification === "undefined") {
            setError("Desktop notifications are not supported in this runtime.");
            return;
        }

        if (Notification.permission === "granted") {
            onChange({ ...settings, notificationsEnabled: true });
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            setError("Desktop notifications permission was denied.");
            onChange({ ...settings, notificationsEnabled: false });
            return;
        }

        onChange({ ...settings, notificationsEnabled: true });
    };

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Notifications</h2>
            <p className="settings-tab-description">
                Matrix-native local notification handling using Matrix push-actions.
            </p>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={desktopEnabled}
                    onChange={(event) => {
                        void setDesktopEnabled(event.target.checked);
                    }}
                />
                Enable desktop notifications for this session
            </label>
            <p className="settings-inline-note">
                Permission:{" "}
                {desktopPermission === "unsupported"
                    ? "unsupported"
                    : desktopPermission === "granted"
                      ? "granted"
                      : desktopPermission === "denied"
                        ? "denied"
                        : "default"}
            </p>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.notificationBodyEnabled}
                    onChange={(event) => onChange({ ...settings, notificationBodyEnabled: event.target.checked })}
                />
                Show message body in desktop notifications
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.audioNotificationsEnabled}
                    onChange={(event) => onChange({ ...settings, audioNotificationsEnabled: event.target.checked })}
                />
                Enable notification sound
            </label>

            <NotificationSoundsCard settings={settings} onChange={onChange} />
            <div className="settings-section-card">
                <h3>Sound style</h3>
                <div className="settings-theme-row" role="radiogroup" aria-label="Sound style">
                    {([
                        ["pixel", "8-bit"],
                        ["smooth", "Smooth"],
                    ] as const).map(([style, label]) => (
                        <button
                            key={style}
                            type="button"
                            role="radio"
                            aria-checked={settings.soundStyle === style}
                            className={`settings-theme-button${settings.soundStyle === style ? " is-active" : ""}`}
                            onClick={() => {
                                setSoundStyle(style);
                                onChange({ ...settings, soundStyle: style });
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="settings-field-help">The message sound, ringtone and call sounds: the same tunes as chiptune or as soft bell tones.</p>
            </div>

            <RingtoneSettings settings={settings} speakerId={speakerId} onChange={onChange} />

            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}

