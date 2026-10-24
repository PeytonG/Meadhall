// SPDX-License-Identifier: AGPL-3.0-only
// The in-call soundboard: built-in sounds and your own, played for everyone in the call. Your own sounds are added
// and removed here.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { decodeSoundFile, initialSelection, trimToWav } from "../../voice/soundboard/trim";
import { SoundTrimmer } from "./SoundTrimmer";

export type SoundChoice = { kind: "builtin"; id: string; name: string } | { kind: "custom"; sound: CustomSound };

interface SoundboardPanelProps {
    client: MatrixClient;
    onPlay: (choice: SoundChoice) => Promise<void>;
    // A popover in calls (closes on Escape or a click outside); without onClose it sits inline, as in Settings.
    onClose?: () => void;
    hint?: string;
    // 0-100.
    volume?: number;
    onVolumeChange?: (volume: number) => void;
    // Sharing on (Settings → Privacy): a share button on each of your own sounds.
    onShareSound?: (sound: CustomSound) => void;
}

export function SoundboardPanel({ client, onPlay, onClose, hint = "Everyone in the call hears these.", volume, onVolumeChange, onShareSound }: SoundboardPanelProps): React.ReactElement {
    const [custom, setCustom] = useState<CustomSound[]>(() => loadCustomSounds(client));
    const [adding, setAdding] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    // The chosen file, decoded for trimming, and the part of it to keep.
    const [decoded, setDecoded] = useState<AudioBuffer | null>(null);
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const [name, setName] = useState("");
    const [emoji, setEmoji] = useState("🔊");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    // In a call the panel opens upwards from its button: as tall as the space above it in the call view (it used
    // to have a fixed cap and overflowed behind the view, hiding its first rows), scrolling beyond that.
    const [maxHeight, setMaxHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        if (!onClose) return undefined;
        const update = (): void => {
            const panel = panelRef.current;
            const anchor = panel?.parentElement;
            const bounds = panel?.closest(".voice-room-panel");
            if (!anchor || !bounds) return;
            const space = anchor.getBoundingClientRect().top - bounds.getBoundingClientRect().top - 16;
            setMaxHeight(Math.max(160, Math.floor(space)));
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [onClose]);

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

    const chooseFile = (chosen: File | null): void => {
        setFile(chosen);
        setDecoded(null);
        setError(null);
        if (!chosen) return;
        void decodeSoundFile(chosen)
            .then((buffer) => {
                setDecoded(buffer);
                setSelection(initialSelection(buffer.duration));
            })
            .catch((decodeError: unknown) => setError(decodeError instanceof Error ? decodeError.message : "Couldn't read that sound."));
    };

    const save = async (): Promise<void> => {
        if (!file || !decoded) return;
        setBusy(true);
        setError(null);
        try {
            // Always the trimmed part, re-encoded small (mono WAV), so long or high-quality files fit too.
            const clip = await trimToWav(decoded, selection.start, selection.end, file.name);
            const sound = await addCustomSound(client, clip, name || file.name.replace(/\.[^.]+$/, ""), emoji);
            setCustom((current) => [...current.filter((item) => item.id !== sound.id), sound]);
            setAdding(false);
            setFile(null);
            setDecoded(null);
            setName("");
            setEmoji("🔊");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Couldn't add that sound.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`soundboard-panel${onClose ? "" : " is-inline"}`} role={onClose ? "dialog" : "region"} aria-label="Soundboard" ref={panelRef} data-testid="soundboard" style={maxHeight === null ? undefined : { maxHeight }}>
            <header className="soundboard-header">
                {/* Inline (Settings), the surrounding card already has the title. */}
                {onClose ? <h3>Soundboard</h3> : null}
                <span>{hint}</span>
                {onVolumeChange && volume !== undefined ? (
                    <label className="soundboard-volume">
                        <span>Volume {volume}%</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={volume}
                            aria-label="Soundboard volume"
                            data-testid="soundboard-volume"
                            onChange={(event) => onVolumeChange(Number(event.target.value))}
                        />
                    </label>
                ) : null}
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
                        {onShareSound ? (
                            <button
                                type="button"
                                className="soundboard-share"
                                aria-label={`Share ${sound.name}`}
                                title={`Share ${sound.name} with friends`}
                                onClick={() => onShareSound(sound)}
                            >
                                ↗
                            </button>
                        ) : null}
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
                        <span>Sound file (you can trim it to up to 8 seconds next)</span>
                        <input
                            type="file"
                            accept="audio/*"
                            data-testid="soundboard-file"
                            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                        />
                    </label>
                    {decoded ? <SoundTrimmer buffer={decoded} selection={selection} onChange={setSelection} /> : null}
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
                        <button type="button" className="settings-button" disabled={!decoded || busy} onClick={() => void save()}>
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
