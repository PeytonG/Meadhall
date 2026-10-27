// SPDX-License-Identifier: AGPL-3.0-only
// A shared sound or style profile in a chat: what it adds, a preview for sounds, and Adopt. With sharing off
// (Settings → Privacy & Safety), it says how to turn it on instead.
import React, { useEffect, useState } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { fetchSharedItem } from "../../core/sharing/share";
import type { MeadhallItem, ShareSummary } from "../../core/sharing/meadhallFile";
import { PixelIcon } from "../components/PixelIcon";
import { adoptSharedSound, previewSharedSound } from "./sharedSounds";
import { useSharingEnabled } from "./sharingSetting";
import { SOUNDBOARD_ACCOUNT_DATA, loadCustomSounds } from "../voice/soundboard/soundboard";
import { STYLE_PROFILES_TYPE, adoptSharedStyle, readStyleProfiles } from "./styleProfiles";

interface ShareCardProps {
    client: MatrixClient;
    summary: ShareSummary;
    mxc: string | null;
    fromMe: boolean;
}

// Whether this share is already in your soundboard or style profiles: adopted from this very share (remembered as
// its source), or, for items adopted before that was remembered, one with the same name (and emoji, for sounds).
// Read from your account data, so it holds after reopening the chat and for every copy of the card.
function isAdopted(client: MatrixClient, summary: ShareSummary, source: string | null): boolean {
    if (summary.kind === "sound") {
        return loadCustomSounds(client).some((sound) =>
            sound.source ? sound.source === source : sound.name === summary.name && (!summary.emoji || sound.emoji === summary.emoji),
        );
    }
    return readStyleProfiles(client).some((profile) => (profile.source ? profile.source === source : profile.name === summary.name));
}

function useAdopted(client: MatrixClient, summary: ShareSummary, source: string | null): boolean {
    const [adopted, setAdopted] = useState(() => isAdopted(client, summary, source));
    useEffect(() => {
        setAdopted(isAdopted(client, summary, source));
        const onAccountData = (event: MatrixEvent): void => {
            if (event.getType() === SOUNDBOARD_ACCOUNT_DATA || event.getType() === STYLE_PROFILES_TYPE) {
                setAdopted(isAdopted(client, summary, source));
            }
        };
        client.on(ClientEvent.AccountData, onAccountData);
        return () => {
            client.removeListener(ClientEvent.AccountData, onAccountData);
        };
    }, [client, source, summary]);
    return adopted;
}

export function ShareCard({ client, summary, mxc, fromMe }: ShareCardProps): React.ReactElement {
    const enabled = useSharingEnabled();
    const [item, setItem] = useState<MeadhallItem | null>(null);
    const [busy, setBusy] = useState<"play" | "adopt" | null>(null);
    const [justAdopted, setJustAdopted] = useState(false);
    const adopted = useAdopted(client, summary, mxc) || justAdopted;
    const [error, setError] = useState<string | null>(null);

    const load = async (): Promise<MeadhallItem> => {
        if (item) return item;
        if (!mxc) throw new Error("This share can't be opened here.");
        const loaded = await fetchSharedItem(client, mxc);
        if (loaded.kind !== summary.kind) throw new Error("This share doesn't match what it says it is.");
        setItem(loaded);
        return loaded;
    };

    const run = async (kind: "play" | "adopt", action: () => Promise<void>): Promise<void> => {
        setBusy(kind);
        setError(null);
        try {
            await action();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
        } finally {
            setBusy(null);
        }
    };

    const adopt = (): Promise<void> =>
        run("adopt", async () => {
            const loaded = await load();
            if (loaded.kind === "sound") await adoptSharedSound(client, loaded, mxc ?? undefined);
            else await adoptSharedStyle(client, loaded, mxc ?? undefined);
            setJustAdopted(true);
        });

    const isSound = summary.kind === "sound";
    return (
        <div className="share-card" data-testid="share-card" data-kind={summary.kind}>
            <span className="share-card-icon" aria-hidden="true">
                {isSound ? summary.emoji || "🔊" : <PixelIcon name="gear" size={20} />}
            </span>
            <span className="share-card-text">
                <strong>{summary.name}</strong>
                <small>{isSound ? "Soundboard sound" : "Style profile (colors, fonts, icons)"}</small>
            </span>
            {enabled ? (
                <span className="share-card-actions">
                    {isSound ? (
                        <button type="button" className="share-card-button" disabled={busy !== null} onClick={() => void run("play", async () => {
                            const loaded = await load();
                            if (loaded.kind === "sound") await previewSharedSound(loaded);
                        })}>
                            Play
                        </button>
                    ) : null}
                    {fromMe ? null : (
                        <button type="button" className="share-card-button is-primary" disabled={adopted || busy !== null} onClick={() => void adopt()} data-testid="share-adopt">
                            {adopted ? (isSound ? "Added to your soundboard" : "Saved to your style profiles") : busy === "adopt" ? "Adding..." : "Adopt"}
                        </button>
                    )}
                </span>
            ) : (
                <small className="share-card-off">Turn on Sharing in Settings → Privacy &amp; Safety to adopt this.</small>
            )}
            {error ? (
                <small className="share-card-error" role="alert">
                    {error}
                </small>
            ) : null}
        </div>
    );
}
