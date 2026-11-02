// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings → Auto-mod: rules the server's bot applies to every message (blocked words, links, mention
// spam), and what it does to someone who breaks them. The bot needs a role that can manage messages (and, for
// timeouts, manage roles).
import React, { useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import type { ToastState } from "../../../components/Toast";
import { AUTOMOD_EVENT, type AutomodConfig } from "../../../../core/bots/botProtocol";
import { BOT_STATE_TYPES, readAutomod, readBots, saveAutomod, useSpaceState } from "../../../../core/bots/serverBots";
import { readRoles } from "../../../../core/roles/applyRoles";

interface AutomodTabProps {
    client: MatrixClient;
    spaceRoom: Room;
    onToast: (toast: Omit<ToastState, "id">) => void;
}

export function AutomodTab({ client, spaceRoom, onToast }: AutomodTabProps): React.ReactElement {
    const revision = useSpaceState(spaceRoom, BOT_STATE_TYPES);
    const saved = useMemo(() => readAutomod(spaceRoom), [spaceRoom, revision]);
    const roles = useMemo(() => readRoles(spaceRoom), [spaceRoom, revision]);
    const canEdit = spaceRoom.currentState.maySendStateEvent(AUTOMOD_EVENT, client.getSafeUserId());
    const [draft, setDraft] = useState<AutomodConfig>(saved);
    const [wordsText, setWordsText] = useState(saved.blockedWords.join("\n"));
    const [busy, setBusy] = useState(false);
    const update = (patch: Partial<AutomodConfig>): void => setDraft((current) => ({ ...current, ...patch }));
    const disabled = busy || !canEdit;

    const save = async (): Promise<void> => {
        setBusy(true);
        try {
            const blockedWords = [...new Set(wordsText.split(/[\n,]/).map((word) => word.trim().toLowerCase()).filter(Boolean))].slice(0, 200);
            await saveAutomod(client, spaceRoom, { ...draft, blockedWords });
            onToast({ type: "success", message: "Auto-mod saved." });
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't save auto-mod." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="settings-tab" data-testid="automod-tab">
            <h2 className="settings-tab-title">Auto-mod</h2>
            <p className="settings-tab-description">The space&apos;s bot removes messages that break these rules, in every channel.</p>
            {readBots(spaceRoom).length === 0 ? <p className="settings-inline-error">Add a bot first (Space Settings → Bots): auto-mod runs in the bot.</p> : null}

            <div className="settings-section-card">
                <label className="settings-toggle">
                    <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} disabled={disabled} data-testid="automod-enabled" />
                    Turn on auto-mod
                </label>
                <label className="settings-field">
                    <span>Blocked words and phrases (one per line)</span>
                    <textarea value={wordsText} onChange={(event) => setWordsText(event.target.value)} rows={5} disabled={disabled} aria-label="Blocked words" />
                </label>
                <label className="settings-toggle">
                    <input type="checkbox" checked={draft.blockLinks} onChange={(event) => update({ blockLinks: event.target.checked })} disabled={disabled} />
                    Remove links
                </label>
                <label className="settings-field">
                    <span>Most mentions in one message (0 = no limit)</span>
                    <input type="number" min={0} max={100} value={draft.maxMentions} onChange={(event) => update({ maxMentions: Number(event.target.value) || 0 })} disabled={disabled} aria-label="Most mentions" />
                </label>
            </div>

            <div className="settings-section-card">
                <h3>When someone breaks a rule</h3>
                {(
                    [
                        ["delete", "Remove the message"],
                        ["warn", "Remove it and warn them in the channel"],
                        ["timeout", "Remove it, warn them, and stop them talking for a while"],
                    ] as const
                ).map(([value, label]) => (
                    <label key={value} className="settings-toggle">
                        <input type="radio" name="automod-action" checked={draft.action === value} onChange={() => update({ action: value })} disabled={disabled} />
                        {label}
                    </label>
                ))}
                {draft.action === "timeout" ? (
                    <label className="settings-field">
                        <span>Timeout (minutes)</span>
                        <input type="number" min={1} max={10080} value={draft.timeoutMinutes} onChange={(event) => update({ timeoutMinutes: Math.max(1, Number(event.target.value) || 1) })} disabled={disabled} aria-label="Timeout minutes" />
                    </label>
                ) : null}
                <label className="settings-field">
                    <span>Never check</span>
                    <select value={draft.exemptRank} onChange={(event) => update({ exemptRank: Number(event.target.value) })} disabled={disabled} aria-label="Exempt from auto-mod">
                        {roles.map((role) => (
                            <option key={role.id} value={role.rank}>
                                {role.name} and above
                            </option>
                        ))}
                        <option value={50}>Moderators and admins</option>
                        <option value={100}>Admins only</option>
                    </select>
                </label>
            </div>
            <div className="settings-actions-row">
                <button type="button" className="settings-button" onClick={() => void save()} disabled={disabled} data-testid="automod-save">
                    {busy ? "Saving…" : "Save auto-mod"}
                </button>
            </div>
        </div>
    );
}
