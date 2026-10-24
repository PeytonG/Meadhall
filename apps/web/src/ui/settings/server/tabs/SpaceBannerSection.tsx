// SPDX-License-Identifier: AGPL-3.0-only
// Server settings → Overview → Banner: the picture under the server's name in the channel list.
import React, { useRef, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { canEditSpaceBanner, getSpaceBanner, setSpaceBanner } from "../../../../core/rooms/spaceBanner";
import { mediaFromMxc } from "../../../adapters/media";

const MAX_BANNER_BYTES = 10 * 1024 * 1024;

interface SpaceBannerSectionProps {
    client: MatrixClient;
    spaceRoom: Room;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

export function SpaceBannerSection({ client, spaceRoom, onToast }: SpaceBannerSectionProps): React.ReactElement {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const banner = getSpaceBanner(spaceRoom);
    const canEdit = canEditSpaceBanner(spaceRoom, client.getUserId() ?? "");
    const preview = banner ? mediaFromMxc(client, banner) : null;

    const upload = async (file: File): Promise<void> => {
        if (!file.type.startsWith("image/") || file.size > MAX_BANNER_BYTES) {
            onToast({ type: "error", message: "Pick an image or GIF of 10 MB or less." });
            return;
        }
        setBusy(true);
        try {
            const { content_uri: mxc } = await client.uploadContent(file, { type: file.type, name: file.name });
            await setSpaceBanner(client, spaceRoom.roomId, mxc);
            onToast({ type: "success", message: "Server banner updated." });
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't set the banner." });
        } finally {
            setBusy(false);
        }
    };

    const remove = async (): Promise<void> => {
        setBusy(true);
        try {
            await setSpaceBanner(client, spaceRoom.roomId, null);
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't remove the banner." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="settings-section-card" data-testid="space-banner-settings">
            <h3>Banner</h3>
            <p className="settings-tab-description">Shown under the server&apos;s name at the top of the channel list. GIFs play. Wide pictures (about 3:1) fit best.</p>
            <div className="space-banner-preview">{preview ? <img src={preview} alt="Current banner" /> : <span>No banner</span>}</div>
            <div className="settings-actions-row">
                <button type="button" className="settings-button" disabled={!canEdit || busy} onClick={() => inputRef.current?.click()} title={canEdit ? "" : "You can't change this server's banner."}>
                    {busy ? "Saving..." : banner ? "Change banner" : "Upload banner"}
                </button>
                {banner ? (
                    <button type="button" className="settings-button settings-button-secondary" disabled={!canEdit || busy} onClick={() => void remove()}>
                        Remove banner
                    </button>
                ) : null}
                <input
                    ref={inputRef}
                    className="settings-hidden-input"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    data-testid="space-banner-input"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void upload(file);
                        event.currentTarget.value = "";
                    }}
                />
            </div>
        </div>
    );
}
