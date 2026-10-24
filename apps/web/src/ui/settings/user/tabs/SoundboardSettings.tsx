// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Audio → Soundboard: add or remove your own sounds and preview any sound (only you hear previews). With
// sharing on (Settings → Privacy & Safety), share your sounds with friends, save them as .meadhall files, and import
// .meadhall files.
import React, { useEffect, useRef, useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { SoundboardPanel, type SoundChoice } from "../../../components/voice/SoundboardPanel";
import { renderBuiltinSound } from "../../../voice/soundboard/builtinSounds";
import { decodeCustomSound, SoundboardPlayer, type CustomSound } from "../../../voice/soundboard/soundboard";
import { downloadMeadhallFile, readMeadhallFile } from "../../../../core/sharing/share";
import { ShareDialog } from "../../../sharing/ShareDialog";
import { adoptSharedSound, soundToShare } from "../../../sharing/sharedSounds";
import { useSharingEnabled } from "../../../sharing/sharingSetting";
import { adoptSharedStyle } from "../../../sharing/styleProfiles";

interface SoundboardSettingsProps {
    client: MatrixClient;
    volume: number;
    onVolumeChange: (volume: number) => void;
}

export function SoundboardSettings({ client, volume, onVolumeChange }: SoundboardSettingsProps): React.ReactElement {
    const playerRef = useRef<SoundboardPlayer | null>(null);
    useEffect(() => () => playerRef.current?.close(), []);
    const sharing = useSharingEnabled();
    const [sharingSound, setSharingSound] = useState<CustomSound | null>(null);
    const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
    // Re-read the list after importing a sound.
    const [panelVersion, setPanelVersion] = useState(0);

    const preview = async (choice: SoundChoice): Promise<void> => {
        playerRef.current ??= new SoundboardPlayer();
        const player = playerRef.current;
        player.setVolume(volume);
        const buffer =
            choice.kind === "builtin"
                ? await renderBuiltinSound(choice.id, player.context.sampleRate)
                : await decodeCustomSound(client, choice.sound, player.context);
        await player.play(buffer);
    };

    const importFile = async (file: File): Promise<void> => {
        setStatus(null);
        try {
            const item = await readMeadhallFile(file);
            if (item.kind === "sound") {
                await adoptSharedSound(client, item);
                setPanelVersion((value) => value + 1);
                setStatus({ type: "success", message: `Added "${item.name}" to your soundboard.` });
            } else {
                await adoptSharedStyle(client, item);
                setStatus({ type: "success", message: `Saved "${item.name}" to your style profiles (Settings → Appearance).` });
            }
        } catch (error) {
            setStatus({ type: "error", message: error instanceof Error ? error.message : "Couldn't import that file." });
        }
    };

    return (
        <div className="settings-section-card">
            <h3>Soundboard</h3>
            <SoundboardPanel
                key={panelVersion}
                client={client}
                onPlay={preview}
                volume={volume}
                onVolumeChange={onVolumeChange}
                onShareSound={sharing ? setSharingSound : undefined}
                hint={
                    sharing
                        ? "Click a sound to preview it (only you hear it). ↗ shares one of your sounds with friends."
                        : "Click a sound to preview it (only you hear it). In a call, open Sounds to play them for everyone."
                }
            />
            {sharing ? (
                <label className="settings-field soundboard-import">
                    <span>Import a .meadhall file (a sound or a style profile)</span>
                    <input
                        type="file"
                        accept=".meadhall,application/x-meadhall"
                        data-testid="meadhall-import"
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
            {sharingSound ? (
                <ShareDialog
                    client={client}
                    title={`Share "${sharingSound.name}"`}
                    prepare={() => soundToShare(client, sharingSound)}
                    onExport={async () => downloadMeadhallFile(await soundToShare(client, sharingSound))}
                    onClose={() => setSharingSound(null)}
                    onToast={setStatus}
                />
            ) : null}
        </div>
    );
}
