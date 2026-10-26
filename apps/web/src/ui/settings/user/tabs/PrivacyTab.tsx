import React from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { useIgnoredUsers } from "../../../hooks/useIgnoredUsers";
import type { PrivacySettings } from "../settingsStore";
import { setSharingEnabled, useSharingEnabled } from "../../../sharing/sharingSetting";
import { ActivitySettingsCard } from "./ActivitySettingsCard";

interface PrivacyTabProps {
    client: MatrixClient;
    settings: PrivacySettings;
    onChange: (settings: PrivacySettings) => void;
}

function SharingToggle(): React.ReactElement {
    const enabled = useSharingEnabled();
    return (
        <label className="settings-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setSharingEnabled(event.target.checked)} data-testid="sharing-toggle" />
            Sharing: share soundboard sounds and style profiles with friends, and adopt ones they share with you
        </label>
    );
}

export function PrivacyTab({ client, settings, onChange }: PrivacyTabProps): React.ReactElement {
    const { ignored, setIgnored } = useIgnoredUsers(client);
    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Privacy & Safety</h2>
            <p className="settings-tab-description">
                What other people can see about you, and who you have blocked.
            </p>

            <label className="settings-field">
                <span>Link previews</span>
                <select
                    value={settings.linkPreviews}
                    onChange={(event) => onChange({ ...settings, linkPreviews: event.target.value as PrivacySettings["linkPreviews"] })}
                    data-testid="link-previews"
                >
                    <option value="unencrypted">Only in chats that aren&apos;t encrypted (recommended)</option>
                    <option value="all">Everywhere</option>
                    <option value="off">Off</option>
                </select>
                <small className="settings-hint">
                    To show a preview, your homeserver fetches the page, so it sees the link. In encrypted chats that would
                    let it see links it otherwise couldn&apos;t.
                </small>
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.showReadReceipts}
                    onChange={(event) => onChange({ ...settings, showReadReceipts: event.target.checked })}
                />
                Show read receipts (stub)
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.allowDmsFromServerMembers}
                    onChange={(event) => onChange({ ...settings, allowDmsFromServerMembers: event.target.checked })}
                />
                Allow DMs from server members (stub)
            </label>

            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={settings.shareStatus}
                    onChange={(event) => onChange({ ...settings, shareStatus: event.target.checked })}
                    data-testid="share-status"
                />
                Share my status (off: you appear offline to everyone, with no status text, Do Not Disturb or game shown)
            </label>

            {window.heorotDesktop?.getActivities && settings.shareStatus ? <ActivitySettingsCard settings={settings} onChange={onChange} /> : null}

            <SharingToggle />

            <div className="settings-section-card" data-testid="blocked-users">
                <h3>Blocked people</h3>
                <p className="settings-tab-description">
                    You don't see messages or invites from people you block, on any of your devices (Element respects it too).
                    Block someone from their profile.
                </p>
                {ignored.length === 0 ? <p className="settings-inline-note">You haven't blocked anyone.</p> : null}
                {ignored.map((userId) => (
                    <div className="settings-blocked-row" key={userId}>
                        <span>{client.getUser(userId)?.displayName ?? userId}</span>
                        <small>{userId}</small>
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => void setIgnored(userId, false)}>
                            Unblock
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

