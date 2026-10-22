// SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { thumbnailFromMxc } from "../../../adapters/media";
import { Avatar } from "../../../components/Avatar";
import { PixelCampfire } from "../../../components/voice/PixelCampfire";
import { DEFAULT_FLAME_COLOR } from "../../../voice/campfire";
import { PixelColorWheel } from "../../../theme/PixelColorWheel";
import { saveOwnFlameStyle, useFlameStyle, type FlameStyle } from "../../../voice/flameColor";

// Your speaking indicator in calls: a pixel campfire in your color, or the plain green ring. Saved to your profile,
// so everyone in the call sees your choice.
export function CampfireSettings({ client }: { client: MatrixClient }): React.ReactElement {
    const userId = client.getSafeUserId();
    const saved = useFlameStyle(client, userId);
    const [draft, setDraft] = useState<FlameStyle>(saved);
    const [error, setError] = useState<string | null>(null);
    const user = client.getUser(userId);
    const name = user?.displayName || userId;
    const avatarUrl = thumbnailFromMxc(client, user?.avatarUrl ?? null, 96, 96, "crop");

    useEffect(() => {
        setDraft(saved);
    }, [saved.color, saved.enabled]);

    // Saved a moment after the last change, so dragging across the color wheel doesn't send a burst of updates.
    useEffect(() => {
        if (draft.color === saved.color && draft.enabled === saved.enabled) {
            return undefined;
        }
        const timer = window.setTimeout(() => {
            setError(null);
            void saveOwnFlameStyle(client, draft).catch((saveError: unknown) => {
                setError(
                    saveError instanceof Error
                        ? `Couldn't save to your profile: ${saveError.message}`
                        : "Couldn't save to your profile.",
                );
            });
        }, 600);
        return () => window.clearTimeout(timer);
    }, [client, draft, saved.color, saved.enabled]);

    return (
        <div className="settings-section-card">
            <h3>Speaking campfire</h3>
            <p className="settings-tab-description">
                While you talk in a call, a pixel campfire burns around your picture. Everyone sees your color. Turn it
                off to use the plain green ring.
            </p>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                    data-testid="campfire-toggle"
                />
                Campfire when I talk
            </label>
            <div className="settings-campfire-row">
                <span className="settings-campfire-preview">
                    <Avatar className="settings-campfire-avatar" name={name} src={avatarUrl} seed={userId} userId={userId} />
                    {draft.enabled ? (
                        <PixelCampfire active color={draft.color} />
                    ) : (
                        <span className="voice-room-speaking-indicator is-speaking" aria-hidden="true" />
                    )}
                </span>
                {draft.enabled ? (
                    <PixelColorWheel
                        value={draft.color}
                        onChange={(color) => setDraft({ ...draft, color })}
                        resetColor={DEFAULT_FLAME_COLOR}
                        resetLabel="Reset to campfire orange"
                    />
                ) : null}
            </div>
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}
