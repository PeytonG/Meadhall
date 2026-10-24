// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Appearance → Style profiles: save how Meadhall looks (theme, accent, fonts, icons, emoji, layout, and
// your card gradient and nameplate) as named profiles and switch between them. With sharing on (Settings → Privacy &
// Safety) they can be shared with friends, saved as .meadhall files, and imported.
import React, { useEffect, useState } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { downloadMeadhallFile, readMeadhallFile } from "../../../../core/sharing/share";
import { readProfileStyle, saveOwnProfileStyle } from "../../../profile/useProfileStyle";
import { ShareDialog } from "../../../sharing/ShareDialog";
import { adoptSharedSound } from "../../../sharing/sharedSounds";
import { useSharingEnabled } from "../../../sharing/sharingSetting";
import {
    STYLE_PROFILES_TYPE,
    adoptSharedStyle,
    addStyleProfile,
    appearanceToStyle,
    readStyleProfiles,
    removeStyleProfile,
    styleProfileToShare,
    type StyleProfile,
} from "../../../sharing/styleProfiles";
import type { AppearanceSettings } from "../settingsStore";

interface StyleProfilesSectionProps {
    client: MatrixClient;
    settings: AppearanceSettings;
    onChange: (settings: AppearanceSettings) => void;
}

function describe(profile: StyleProfile): string {
    const parts = [
        profile.appearance.theme ? `${profile.appearance.theme[0]!.toUpperCase()}${profile.appearance.theme.slice(1)} theme` : null,
        profile.appearance.fontStyle ? `${profile.appearance.fontStyle} font` : null,
        profile.appearance.iconStyle ? `${profile.appearance.iconStyle} icons` : null,
        profile.profileStyle ? "card & nameplate" : null,
    ];
    return parts.filter(Boolean).join(" · ");
}

export function StyleProfilesSection({ client, settings, onChange }: StyleProfilesSectionProps): React.ReactElement {
    const sharing = useSharingEnabled();
    const [profiles, setProfiles] = useState<StyleProfile[]>(() => readStyleProfiles(client));
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [sharingProfile, setSharingProfile] = useState<StyleProfile | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

    useEffect(() => {
        const onAccountData = (event: MatrixEvent): void => {
            if (event.getType() === STYLE_PROFILES_TYPE) setProfiles(readStyleProfiles(client));
        };
        client.on(ClientEvent.AccountData, onAccountData);
        return () => {
            client.removeListener(ClientEvent.AccountData, onAccountData);
        };
    }, [client]);

    const run = async (action: () => Promise<string | void>): Promise<void> => {
        setBusy(true);
        setStatus(null);
        try {
            const message = await action();
            setProfiles(readStyleProfiles(client));
            if (message) setStatus({ type: "success", message });
        } catch (error) {
            setStatus({ type: "error", message: error instanceof Error ? error.message : "Something went wrong." });
        } finally {
            setBusy(false);
        }
    };

    const saveCurrent = (): Promise<void> =>
        run(async () => {
            const profileStyle = await readProfileStyle(client, client.getSafeUserId());
            const saved = await addStyleProfile(client, name || "My style", appearanceToStyle(settings), profileStyle);
            setName("");
            return `Saved "${saved.name}".`;
        });

    const use = (profile: StyleProfile): Promise<void> =>
        run(async () => {
            onChange({ ...settings, ...(profile.appearance as Partial<AppearanceSettings>) });
            if (profile.profileStyle) await saveOwnProfileStyle(client, profile.profileStyle);
            return `Now using "${profile.name}".`;
        });

    const importFile = (file: File): Promise<void> =>
        run(async () => {
            const item = await readMeadhallFile(file);
            if (item.kind === "style") return `Saved "${(await adoptSharedStyle(client, item)).name}" to your style profiles.`;
            await adoptSharedSound(client, item);
            return `Added "${item.name}" to your soundboard.`;
        });

    return (
        <div className="settings-section-card" data-testid="style-profiles">
            <h3>Style profiles</h3>
            <p className="settings-tab-description">
                Save how Meadhall looks (theme, accent, fonts, icons, and your card and nameplate) and switch between looks.
                {sharing ? " Share them with friends or save them as .meadhall files." : " Turn on Sharing in Privacy & Safety to share them."}
            </p>
            <div className="style-profiles-save">
                <input type="text" maxLength={32} placeholder="Name this look" aria-label="Style profile name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
                <button type="button" className="settings-button" onClick={() => void saveCurrent()} disabled={busy}>
                    Save current look
                </button>
            </div>
            {profiles.length === 0 ? <p className="settings-inline-note">No style profiles yet.</p> : null}
            <ul className="style-profiles-list">
                {profiles.map((profile) => (
                    <li key={profile.id} data-testid="style-profile">
                        <span className="style-profile-swatch" style={{ background: profile.appearance.accentColor ?? "var(--accent)" }} aria-hidden="true" />
                        <span className="style-profile-text">
                            <strong>{profile.name}</strong>
                            <small>{describe(profile)}</small>
                        </span>
                        <button type="button" className="settings-button" onClick={() => void use(profile)} disabled={busy}>
                            Use
                        </button>
                        {sharing ? (
                            <button type="button" className="settings-button settings-button-secondary" onClick={() => setSharingProfile(profile)} disabled={busy}>
                                Share
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="settings-button settings-button-secondary"
                            aria-label={`Delete ${profile.name}`}
                            onClick={() => void run(async () => {
                                await removeStyleProfile(client, profile.id);
                            })}
                            disabled={busy}
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
            {sharing ? (
                <label className="settings-field">
                    <span>Import a .meadhall file</span>
                    <input
                        type="file"
                        accept=".meadhall,application/x-meadhall"
                        data-testid="style-import"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void importFile(file);
                            event.currentTarget.value = "";
                        }}
                    />
                </label>
            ) : null}
            {status ? (
                <p className={status.type === "error" ? "settings-inline-error" : "settings-inline-note"} role="status">
                    {status.message}
                </p>
            ) : null}
            {sharingProfile ? (
                <ShareDialog
                    client={client}
                    title={`Share "${sharingProfile.name}"`}
                    prepare={async () => styleProfileToShare(sharingProfile)}
                    onExport={async () => downloadMeadhallFile(styleProfileToShare(sharingProfile))}
                    onClose={() => setSharingProfile(null)}
                    onToast={setStatus}
                />
            ) : null}
        </div>
    );
}
