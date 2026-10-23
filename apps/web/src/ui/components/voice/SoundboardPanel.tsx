// SPDX-License-Identifier: AGPL-3.0-only
// The in-call soundboard: built-in sounds and your own, played for everyone in the call. Your own sounds are added
// and removed here.
import React, { useEffect, useRef, useState } from "react";
import { ClientEvent, type MatrixClient, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { BUILTIN_SOUNDS } from "../../voice/soundboard/builtinSounds";
import {
    MAX_CUSTOM_SOUNDS,
    SOUNDBOARD_ACCOUNT_DATA,
    addCustomSound,
    loadCustomSounds,
    removeCustomSound,
    type CustomSound,
} from "../../voice/soundboard/soundboard";

export type SoundChoice = { kind: "builtin"; id: string; name: string } | { kind: "custom"; sound: CustomSound };

interface SoundboardPanelProps {
    client: MatrixClient;
    onPlay: (choice: SoundChoice) => Promise<void>;
    // A popover in calls (closes on Escape or a click outside); without onClose it sits inline, as in Settings.
    onClose?: () => void;
    hint?: string;
}

export function SoundboardPanel({ client, onPlay, onClose, hint = "Everyone in the call hears these." }: SoundboardPanelProps): React.ReactElement {
    const [custom, setCustom] = useState<CustomSound[]>(() => loadCustomSounds(client));
    const [adding, setAdding] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState("");
    const [emoji, setEmoji] = useState("🔊");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onAccountData = (event: MatrixEvent): void => {
            if (event.getType() === SOUNDBOARD_ACCOUNT_DATA) setCustom(loadCustomSounds(client));
        };
        client.on(ClientEvent.AccountData, onAccountData);
        return () => {
            client.off(ClientEvent.AccountData, onAccountData);
        };
    }, [client]);

    useEffect(() => {
        if (!onClose) return undefined;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        const onPointerDown = (event: PointerEvent): void => {
            const target = event.target as Element | null;
            if (!panelRef.current?.contains(target) && !target?.closest?.("[data-soundboard-toggle]")) onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("pointerdown", onPointerDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("pointerdown", onPointerDown, true);
        };
    }, [onClose]);

    const play = (choice: SoundChoice): void => {
        setError(null);
        void onPlay(choice).catch((playError: unknown) => setError(playError instanceof Error ? playError.message : "Couldn't play that sound."));
    };

    const save = async (): Promise<void> => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const sound = await addCustomSound(client, file, name, emoji);
            setCustom((current) => [...current.filter((item) => item.id !== sound.id), sound]);
            setAdding(false);
            setFile(null);
            setName("");
            setEmoji("🔊");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Couldn't add that sound.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`soundboard-panel${onClose ? "" : " is-inline"}`} role={onClose ? "dialog" : "region"} aria-label="Soundboard" ref={panelRef} data-testid="soundboard">
            <header className="soundboard-header">
                <h3>Soundboard</h3>
                <span>{hint}</span>
            </header>
            <div className="soundboard-grid">
                {BUILTIN_SOUNDS.map((sound) => (
                    <button
                        key={sound.id}
                        type="button"
                        className="soundboard-sound"
                        onClick={() => play({ kind: "builtin", id: sound.id, name: sound.name })}
                    >
                        <span className="soundboard-emoji" aria-hidden="true">
                            {sound.emoji}
                        </span>
                        {sound.name}
                    </button>
                ))}
                {custom.map((sound) => (
                    <span className="soundboard-sound-wrap" key={sound.id}>
                        <button type="button" className="soundboard-sound is-custom" onClick={() => play({ kind: "custom", sound })}>
                            <span className="soundboard-emoji" aria-hidden="true">
                                {sound.emoji}
                            </span>
                            {sound.name}
                        </button>
                        <button
                            type="button"
                            className="soundboard-remove"
                            aria-label={`Remove ${sound.name}`}
                            title={`Remove ${sound.name}`}
                            onClick={() => void removeCustomSound(client, sound.id).then(() => setCustom((current) => current.filter((item) => item.id !== sound.id)))}
                        >
                            ×
                        </button>
                    </span>
                ))}
                {!adding && custom.length < MAX_CUSTOM_SOUNDS ? (
                    <button type="button" className="soundboard-sound is-add" onClick={() => setAdding(true)}>
                        <span className="soundboard-emoji" aria-hidden="true">
                            +
                        </span>
                        Add sound
                    </button>
                ) : null}
            </div>
            {adding ? (
                <div className="soundboard-add">
                    <label>
                        <span>Sound file (up to 8 seconds, 1 MB)</span>
                        <input
                            type="file"
                            accept="audio/*"
                            data-testid="soundboard-file"
                            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                        />
                    </label>
                    <div className="soundboard-add-row">
                        <label>
                            <span>Emoji</span>
                            <input type="text" value={emoji} maxLength={4} onChange={(event) => setEmoji(event.target.value)} aria-label="Sound emoji" />
                        </label>
                        <label>
                            <span>Name</span>
                            <input type="text" value={name} maxLength={32} onChange={(event) => setName(event.target.value)} aria-label="Sound name" />
                        </label>
                    </div>
                    <div className="soundboard-add-row">
                        <button type="button" className="settings-button" disabled={!file || busy} onClick={() => void save()}>
                            {busy ? "Uploading..." : "Save sound"}
                        </button>
                        <button type="button" className="settings-button settings-button-secondary" onClick={() => setAdding(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </div>
    );
}
