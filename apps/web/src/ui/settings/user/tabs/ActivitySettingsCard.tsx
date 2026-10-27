// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Privacy → Activity: what Meadhall may notice you doing, what it shares, and with whom.
import React, { useState } from "react";

import {
    ACTIVITY_VERBS,
    activityText,
    isHidden,
    pickActivity,
    useDetectedActivities,
    type ActivityAudience,
    type ActivitySettings,
} from "../../../presence/activitySharing";
import type { PrivacySettings } from "../settingsStore";

const AUDIENCES: Array<{ value: ActivityAudience; label: string; hint: string }> = [
    { value: "contacts", label: "People I share a chat or server with", hint: "Shown as your status text, which your homeserver only shows to people you share a chat or server with." },
    { value: "dms", label: "Only people I have DMs with", hint: "Sent end-to-end encrypted straight to their devices: nobody else sees it, not even the server." },
    { value: "everyone", label: "Everyone", hint: "Also saved in your profile, which anyone who looks you up can read." },
    { value: "nobody", label: "Nobody (just show me here)", hint: "Nothing leaves this computer." },
];

const SOURCE_LABELS: Record<string, string> = { rpc: "Rich Presence", steam: "Steam", game: "Detected game", media: "Media player" };

interface ActivitySettingsCardProps {
    settings: PrivacySettings;
    onChange: (settings: PrivacySettings) => void;
}

export function ActivitySettingsCard({ settings, onChange }: ActivitySettingsCardProps): React.ReactElement {
    const activity = settings.activity;
    const detected = useDetectedActivities();
    const [newHidden, setNewHidden] = useState("");
    const update = (patch: Partial<ActivitySettings>): void => onChange({ ...settings, activity: { ...activity, ...patch } });
    const hide = (name: string): void => {
        const trimmed = name.trim();
        if (trimmed && !activity.hidden.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) update({ hidden: [...activity.hidden, trimmed] });
    };
    const shared = settings.shareActivity ? pickActivity(detected, activity, null) : null;
    const isLinux = typeof navigator !== "undefined" && /Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent);

    return (
        <div className="settings-section-card" data-testid="activity-settings">
            <h3>Activity</h3>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.shareActivity}
                    onChange={(event) => onChange({ ...settings, shareActivity: event.target.checked })}
                    data-testid="share-activity"
                />
                Share what I&apos;m doing (&quot;Playing ...&quot;, &quot;Listening to ...&quot; under your name)
            </label>

            {settings.shareActivity ? (
                <>
                    <p className="settings-tab-description">Where it can come from:</p>
                    <label className="settings-toggle">
                        <input type="checkbox" checked={activity.steam} onChange={(event) => update({ steam: event.target.checked })} data-testid="activity-steam" />
                        Games running in Steam
                    </label>
                    <label className="settings-toggle">
                        <input type="checkbox" checked={activity.games} onChange={(event) => update({ games: event.target.checked })} data-testid="activity-games" />
                        Games recognised from running programs (checks the program list every 15 seconds, on this computer only)
                    </label>
                    <label className="settings-toggle">
                        <input
                            type="checkbox"
                            checked={activity.richPresence}
                            onChange={(event) => update({ richPresence: event.target.checked })}
                            data-testid="activity-rich-presence"
                        />
                        Apps with Discord Rich Presence (games, music players, code editors). Meadhall listens for them on this
                        computer only while this is on; app names come from a built-in list, nothing is looked up online.
                    </label>
                    {isLinux ? (
                        <label className="settings-toggle">
                            <input type="checkbox" checked={activity.media} onChange={(event) => update({ media: event.target.checked })} data-testid="activity-media" />
                            Music and videos playing (MPRIS) as &quot;Listening to ...&quot;
                        </label>
                    ) : null}
                    <label className="settings-toggle">
                        <input type="checkbox" checked={activity.showDetails} onChange={(event) => update({ showDetails: event.target.checked })} data-testid="activity-details" />
                        Include details apps give (like &quot;In a match · 3 of 5&quot; or the artist), not just the name
                    </label>

                    <label className="settings-field">
                        <span>Who can see it</span>
                        <select value={activity.audience} onChange={(event) => update({ audience: event.target.value as ActivityAudience })} data-testid="activity-audience">
                            {AUDIENCES.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <small className="settings-hint">{AUDIENCES.find((option) => option.value === activity.audience)?.hint}</small>
                    </label>

                    <div className="activity-now" data-testid="activity-now">
                        <strong>Right now</strong>
                        {detected.length === 0 ? <p className="settings-inline-note">Nothing detected.</p> : null}
                        {detected.map((entry) => {
                            const hidden = isHidden(entry, activity.hidden);
                            return (
                                <div className="activity-now-row" key={`${entry.source}:${entry.name}`}>
                                    <span>
                                        {ACTIVITY_VERBS[entry.kind]} <strong>{entry.name}</strong>
                                        {entry.details ? ` · ${entry.details}` : ""} <small>({SOURCE_LABELS[entry.source] ?? entry.source})</small>
                                        {hidden ? <small> · hidden</small> : null}
                                    </span>
                                    {!hidden ? (
                                        <button type="button" className="settings-button settings-button-secondary" onClick={() => hide(entry.name)} data-testid="activity-hide">
                                            Never share this
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                        <p className="settings-inline-note" data-testid="activity-preview">
                            {shared
                                ? activity.audience === "nobody"
                                    ? `Only you see: ${activityText(shared)}`
                                    : `Shared as: ${activityText(shared)}`
                                : "Nothing is shared right now."}
                        </p>
                    </div>

                    <div className="activity-hidden">
                        <strong>Never share</strong>
                        {activity.hidden.length === 0 ? <p className="settings-inline-note">Nothing hidden.</p> : null}
                        <div className="activity-hidden-list">
                            {activity.hidden.map((entry) => (
                                <span className="activity-hidden-chip" key={entry}>
                                    {entry}
                                    <button
                                        type="button"
                                        aria-label={`Share ${entry} again`}
                                        onClick={() => update({ hidden: activity.hidden.filter((item) => item !== entry) })}
                                    >
                                        x
                                    </button>
                                </span>
                            ))}
                        </div>
                        <form
                            className="activity-hidden-add"
                            onSubmit={(event) => {
                                event.preventDefault();
                                hide(newHidden);
                                setNewHidden("");
                            }}
                        >
                            <input
                                type="text"
                                value={newHidden}
                                placeholder="Game or app name"
                                maxLength={128}
                                onChange={(event) => setNewHidden(event.target.value)}
                                aria-label="Add a game or app never to share"
                                data-testid="activity-hidden-input"
                            />
                            <button type="submit" className="settings-button settings-button-secondary" disabled={!newHidden.trim()}>
                                Add
                            </button>
                        </form>
                    </div>
                </>
            ) : null}
        </div>
    );
}
