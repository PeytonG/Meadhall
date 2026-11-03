// SPDX-License-Identifier: AGPL-3.0-only
// The game overlay page (desktop, Shift+`): the call bar at the top, who's in the call on the left, recent messages
// below it. Transparent everywhere else, so the game shows through. Esc, the X or Shift+` again closes it.
import React, { useEffect, useState } from "react";

import { CloseIcon } from "../components/CloseIcon";
import { PixelIcon } from "../components/PixelIcon";
import { applyAppearanceTheme, loadUserLocalSettings } from "../settings/user/settingsStore";
import { EMPTY_OVERLAY_STATE, parseOverlayState, type OverlayCommand, type OverlayState } from "./overlayState";

function send(command: OverlayCommand): void {
    void window.heorotDesktop?.overlayCommand?.(command);
}

function close(): void {
    void window.heorotDesktop?.closeOverlay?.();
}

export function OverlayApp(): React.ReactElement {
    const [state, setState] = useState<OverlayState>(EMPTY_OVERLAY_STATE);

    useEffect(() => {
        // Same look as the app (pixel or smooth, theme color).
        applyAppearanceTheme(loadUserLocalSettings().appearance);
        document.documentElement.classList.add("is-overlay");
        void window.heorotDesktop?.getOverlayState?.().then((value) => setState(parseOverlayState(value)));
        const stop = window.heorotDesktop?.onOverlayState?.((value) => setState(parseOverlayState(value)));
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            stop?.();
            window.removeEventListener("keydown", onKey);
        };
    }, []);

    const button = (command: OverlayCommand, icon: React.ComponentProps<typeof PixelIcon>["name"], label: string, active = false, danger = false): React.ReactElement => (
        <button
            type="button"
            className={`overlay-button${active ? " is-active" : ""}${danger ? " is-danger" : ""}`}
            onClick={() => send(command)}
            aria-label={label}
            title={label}
            aria-pressed={command === "leave" ? undefined : active}
        >
            <PixelIcon name={icon} size={20} />
        </button>
    );

    return (
        <div className="overlay-root" data-testid="overlay">
            <header className="overlay-bar">
                {state.inCall ? (
                    <>
                        {button("toggleMute", "mic", state.micMuted ? "Unmute" : "Mute", state.micMuted)}
                        {button("toggleDeafen", "headphones", state.deafened ? "Undeafen" : "Deafen", state.deafened)}
                        {button("toggleCamera", "camera", state.cameraOn ? "Turn camera off" : "Turn camera on", state.cameraOn)}
                        {button("toggleScreenShare", "screen", state.sharing ? "Stop sharing" : "Share screen", state.sharing)}
                        {button("openSoundboard", "soundboard", "Soundboard")}
                        {button("leave", "hangup", "Leave call", false, true)}
                        <span className="overlay-bar-status">
                            <strong>Voice Connected</strong>
                            <small>{state.channel ?? "Voice channel"}</small>
                        </span>
                    </>
                ) : (
                    <span className="overlay-bar-status">
                        <strong>Not in a call</strong>
                        <small>Join a voice channel in Meadhall to see it here.</small>
                    </span>
                )}
                <button type="button" className="overlay-button" onClick={() => send("openApp")} aria-label="Open Meadhall" title="Open Meadhall">
                    <PixelIcon name="home" size={20} />
                </button>
                <button type="button" className="overlay-close" onClick={close} aria-label="Close overlay (Esc)" title="Close (Esc)">
                    <CloseIcon size={18} />
                    <small>ESC</small>
                </button>
            </header>

            {state.inCall ? (
                <section className="overlay-widget overlay-members" aria-label="Voice channel">
                    <h2>Voice channel</h2>
                    <ul>
                        {state.participants.map((person) => (
                            <li key={person.userId} className={person.speaking ? "is-speaking" : undefined}>
                                <span className="overlay-dot" aria-hidden="true" />
                                {person.name}
                                {person.sharing ? <span className="overlay-live">LIVE</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {state.messages.length ? (
                <section className="overlay-widget overlay-messages" aria-label="Recent messages">
                    <h2>Recent messages</h2>
                    <ul>
                        {state.messages.map((message) => (
                            <li key={message.id}>
                                <strong>{message.sender}</strong> <small>{message.room}</small>
                                <p>{message.body}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            <p className="overlay-hint">Shift + ` to close</p>
        </div>
    );
}
