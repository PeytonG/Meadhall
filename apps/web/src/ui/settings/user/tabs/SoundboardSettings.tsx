// SPDX-License-Identifier: AGPL-3.0-only
// Settings → Audio → Soundboard: add or remove your own sounds and preview any sound (only you hear previews).
import React, { useEffect, useRef } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { SoundboardPanel, type SoundChoice } from "../../../components/voice/SoundboardPanel";
import { renderBuiltinSound } from "../../../voice/soundboard/builtinSounds";
import { decodeCustomSound, SoundboardPlayer } from "../../../voice/soundboard/soundboard";

export function SoundboardSettings({ client }: { client: MatrixClient }): React.ReactElement {
    const playerRef = useRef<SoundboardPlayer | null>(null);
    useEffect(() => () => playerRef.current?.close(), []);

    const preview = async (choice: SoundChoice): Promise<void> => {
        playerRef.current ??= new SoundboardPlayer();
        const player = playerRef.current;
        const buffer =
            choice.kind === "builtin"
                ? await renderBuiltinSound(choice.id, player.context.sampleRate)
                : await decodeCustomSound(client, choice.sound, player.context);
        await player.play(buffer);
    };

    return (
        <div className="settings-section-card">
            <h3>Soundboard</h3>
            <SoundboardPanel
                client={client}
                onPlay={preview}
                hint="Click a sound to preview it (only you hear it). In a call, open Sounds to play them for everyone."
            />
        </div>
    );
}
