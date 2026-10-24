// SPDX-License-Identifier: AGPL-3.0-only
// A shared sound or style profile in a chat: what it adds, a preview for sounds, and Adopt. With sharing off
// (Settings → Privacy & Safety), it says how to turn it on instead.
import React, { useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { fetchSharedItem } from "../../core/sharing/share";
import type { MeadhallItem, ShareSummary } from "../../core/sharing/meadhallFile";
import { PixelIcon } from "../components/PixelIcon";
import { adoptSharedSound, previewSharedSound } from "./sharedSounds";
import { useSharingEnabled } from "./sharingSetting";
import { adoptSharedStyle } from "./styleProfiles";

interface ShareCardProps {
    client: MatrixClient;
    summary: ShareSummary;
    mxc: string | null;
    fromMe: boolean;
}

export function ShareCard({ client, summary, mxc, fromMe }: ShareCardProps): React.ReactElement {
    const enabled = useSharingEnabled();
    const [item, setItem] = useState<MeadhallItem | null>(null);
    const [state, setState] = useState<"idle" | "busy" | "adopted">("idle");
    const [error, setError] = useState<string | null>(null);

    const load = async (): Promise<MeadhallItem> => {
        if (item) return item;
        if (!mxc) throw new Error("This share can't be opened here.");
        const loaded = await fetchSharedItem(client, mxc);
        if (loaded.kind !== summary.kind) throw new Error("This share doesn't match what it says it is.");
        setItem(loaded);
        return loaded;
    };

    const run = async (action: () => Promise<void>): Promise<void> => {
        setState("busy");
        setError(null);
        try {
            await action();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
            setState("idle");
        }
    };

    const adopt = (): Promise<void> =>
        run(async () => {
            const loaded = await load();
            if (loaded.kind === "sound") await adoptSharedSound(client, loaded);
            else await adoptSharedStyle(client, loaded);
            setState("adopted");
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
                        <button type="button" className="share-card-button" disabled={state === "busy"} onClick={() => void run(async () => {
                            const loaded = await load();
                            if (loaded.kind === "sound") await previewSharedSound(loaded);
                            setState("idle");
                        })}>
                            Play
                        </button>
                    ) : null}
                    {fromMe ? null : (
                        <button type="button" className="share-card-button is-primary" disabled={state !== "idle"} onClick={() => void adopt()} data-testid="share-adopt">
                            {state === "adopted" ? (isSound ? "Added to your soundboard" : "Saved to your style profiles") : state === "busy" ? "Adding..." : "Adopt"}
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
