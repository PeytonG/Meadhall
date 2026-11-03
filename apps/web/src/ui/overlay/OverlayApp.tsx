// SPDX-License-Identifier: AGPL-3.0-only
// The game overlay page (desktop, Shift+`), like Discord's: the call bar at the top, and widgets you can move, show or
// hide, and pin. Voice (who's talking, per-person volume), Text chat (read and send), Notifications, Soundboard.
// Pinned widgets stay on screen after you close the overlay (click-through, so the game keeps your mouse). Esc, the X
// or Shift+` again closes it. Transparent everywhere else, so the game shows through.
import React, { useEffect, useRef, useState } from "react";

import { CloseIcon } from "../components/CloseIcon";
import { PixelIcon } from "../components/PixelIcon";
import { applyAppearanceTheme, loadUserLocalSettings } from "../settings/user/settingsStore";
import { EMPTY_OVERLAY_STATE, parseOverlayState, type OverlayCommand, type OverlayState } from "./overlayState";

type WidgetId = "voice" | "chat" | "notifications" | "soundboard";

interface WidgetLayout {
    x: number;
    y: number;
    visible: boolean;
    pinned: boolean;
}

const WIDGETS: Array<{ id: WidgetId; title: string }> = [
    { id: "voice", title: "Voice" },
    { id: "chat", title: "Text chat" },
    { id: "notifications", title: "Notifications" },
    { id: "soundboard", title: "Soundboard" },
];

const DEFAULT_LAYOUT: Record<WidgetId, WidgetLayout> = {
    voice: { x: 24, y: 24, visible: true, pinned: false },
    chat: { x: 24, y: 300, visible: true, pinned: false },
    notifications: { x: -340, y: 90, visible: true, pinned: false },
    soundboard: { x: -340, y: 360, visible: false, pinned: false },
};

const LAYOUT_KEY = "meadhall.overlay.layout";
const OPACITY_KEY = "meadhall.overlay.opacity";

function loadLayout(): Record<WidgetId, WidgetLayout> {
    try {
        const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as Partial<Record<WidgetId, Partial<WidgetLayout>>>;
        const layout = { ...DEFAULT_LAYOUT };
        for (const { id } of WIDGETS) layout[id] = { ...DEFAULT_LAYOUT[id], ...(saved[id] ?? {}) };
        return layout;
    } catch {
        return { ...DEFAULT_LAYOUT };
    }
}

function loadOpacity(): number {
    try {
        const value = Number(localStorage.getItem(OPACITY_KEY));
        return Number.isFinite(value) && value >= 0.3 && value <= 1 ? value : 0.92;
    } catch {
        return 0.92;
    }
}

function send(command: OverlayCommand): void {
    void window.heorotDesktop?.overlayCommand?.(command);
}

function close(): void {
    void window.heorotDesktop?.closeOverlay?.();
}

// Negative x means "from the right edge".
const left = (x: number): number => (x < 0 ? Math.max(0, window.innerWidth + x) : x);

function Widget({
    id,
    title,
    layout,
    pinnedMode,
    opacity,
    onChange,
    children,
}: {
    id: WidgetId;
    title: string;
    layout: WidgetLayout;
    pinnedMode: boolean;
    opacity: number;
    onChange: (next: WidgetLayout) => void;
    children: React.ReactNode;
}): React.ReactElement {
    const drag = useRef<{ dx: number; dy: number } | null>(null);
    return (
        <section
            className={`overlay-widget${layout.pinned ? " is-pinned" : ""}`}
            style={{ left: left(layout.x), top: layout.y, opacity: pinnedMode ? Math.min(opacity, 0.85) : opacity }}
            aria-label={title}
            data-testid={`overlay-widget-${id}`}
        >
            {pinnedMode ? null : (
                <header
                    className="overlay-widget-header"
                    onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest("button")) return;
                        const box = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (!drag.current) return;
                        onChange({ ...layout, x: Math.max(0, event.clientX - drag.current.dx), y: Math.max(0, event.clientY - drag.current.dy) });
                    }}
                    onPointerUp={() => {
                        drag.current = null;
                    }}
                >
                    <h2>{title}</h2>
                    <button
                        type="button"
                        className={`overlay-icon-button${layout.pinned ? " is-active" : ""}`}
                        aria-pressed={layout.pinned}
                        aria-label={layout.pinned ? `Unpin ${title}` : `Pin ${title}`}
                        title={layout.pinned ? "Unpin (hide while playing)" : "Pin (keep on screen while playing)"}
                        onClick={() => onChange({ ...layout, pinned: !layout.pinned })}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                        </svg>
                    </button>
                    <button type="button" className="overlay-icon-button" aria-label={`Hide ${title}`} title="Hide" onClick={() => onChange({ ...layout, visible: false, pinned: false })}>
                        <CloseIcon size={12} />
                    </button>
                </header>
            )}
            <div className="overlay-widget-body">{children}</div>
        </section>
    );
}

export function OverlayApp(): React.ReactElement {
    const [state, setState] = useState<OverlayState>(EMPTY_OVERLAY_STATE);
    const [mode, setMode] = useState<string>("open");
    const [layout, setLayout] = useState<Record<WidgetId, WidgetLayout>>(loadLayout);
    const [opacity, setOpacity] = useState(loadOpacity);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [chatRoomId, setChatRoomId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [volumeFor, setVolumeFor] = useState<string | null>(null);
    const [shortcut, setShortcut] = useState("Shift + `");

    useEffect(() => {
        // Same look as the app (pixel or smooth, theme color).
        applyAppearanceTheme(loadUserLocalSettings().appearance);
        document.documentElement.classList.add("is-overlay");
        void window.heorotDesktop?.getOverlayState?.().then((value) => setState(parseOverlayState(value)));
        void window.heorotDesktop?.getOverlayMode?.().then((value) => setMode(value || "open"));
        void window.heorotDesktop?.getOverlayShortcut?.().then((value) => {
            if (value) setShortcut(value.split("+").join(" + "));
        });
        const stopState = window.heorotDesktop?.onOverlayState?.((value) => setState(parseOverlayState(value)));
        const stopMode = window.heorotDesktop?.onOverlayMode?.((value) => setMode(value));
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => {
            stopState?.();
            stopMode?.();
            window.removeEventListener("keydown", onKey);
        };
    }, []);

    // Remember the layout, and tell the window whether anything stays on screen when the overlay closes.
    useEffect(() => {
        try {
            localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
        } catch {
            // Private mode: the layout just isn't remembered.
        }
        void window.heorotDesktop?.setOverlayPinned?.(WIDGETS.some(({ id }) => layout[id].visible && layout[id].pinned));
    }, [layout]);
    useEffect(() => {
        try {
            localStorage.setItem(OPACITY_KEY, String(opacity));
        } catch {
            // Not remembered.
        }
    }, [opacity]);

    const pinnedMode = mode === "pinned";
    const chat = state.chats.find((item) => item.roomId === chatRoomId) ?? state.chats[0] ?? null;
    const shown = WIDGETS.filter(({ id }) => layout[id].visible && (!pinnedMode || layout[id].pinned));
    const update = (id: WidgetId) => (next: WidgetLayout) => setLayout((current) => ({ ...current, [id]: next }));

    const barButton = (command: OverlayCommand, icon: React.ComponentProps<typeof PixelIcon>["name"], label: string, active = false, danger = false): React.ReactElement => (
        <button
            type="button"
            className={`overlay-button${active ? " is-active" : ""}${danger ? " is-danger" : ""}`}
            onClick={() => send(command)}
            aria-label={label}
            title={label}
            aria-pressed={command.type === "leave" ? undefined : active}
        >
            <PixelIcon name={icon} size={20} />
        </button>
    );

    const body = (id: WidgetId): React.ReactNode => {
        switch (id) {
            case "voice":
                return state.inCall ? (
                    <ul className="overlay-members">
                        {state.participants.map((person) => (
                            <li key={person.userId} className={person.speaking ? "is-speaking" : undefined}>
                                <button
                                    type="button"
                                    className="overlay-member"
                                    disabled={person.volume === undefined || pinnedMode}
                                    onClick={() => setVolumeFor((current) => (current === person.userId ? null : person.userId))}
                                >
                                    <span className="overlay-dot" aria-hidden="true" />
                                    {person.name}
                                    {person.sharing ? <span className="overlay-live">LIVE</span> : null}
                                </button>
                                {volumeFor === person.userId && person.volume !== undefined && !pinnedMode ? (
                                    <label className="overlay-volume">
                                        <span>Volume {person.volume}%</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={200}
                                            step={5}
                                            value={person.volume}
                                            onChange={(event) => send({ type: "setVolume", userId: person.userId, percent: Number(event.target.value) })}
                                            aria-label={`Volume for ${person.name}`}
                                        />
                                    </label>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="overlay-empty">Not in a call.</p>
                );
            case "chat":
                return chat ? (
                    <div className="overlay-chat">
                        {pinnedMode ? null : (
                            <select value={chat.roomId} onChange={(event) => setChatRoomId(event.target.value)} aria-label="Conversation">
                                {state.chats.map((item) => (
                                    <option key={item.roomId} value={item.roomId}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <ul className="overlay-chat-messages">
                            {chat.messages.map((item) => (
                                <li key={item.id}>
                                    <strong>{item.sender}</strong> {item.body}
                                </li>
                            ))}
                        </ul>
                        {pinnedMode ? null : (
                            <form
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!draft.trim()) return;
                                    send({ type: "sendMessage", roomId: chat.roomId, body: draft });
                                    setDraft("");
                                }}
                            >
                                <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${chat.name}`} aria-label={`Message ${chat.name}`} />
                            </form>
                        )}
                    </div>
                ) : (
                    <p className="overlay-empty">No conversations yet.</p>
                );
            case "notifications":
                return state.notifications.length ? (
                    <ul className="overlay-notifications">
                        {state.notifications.map((item) => (
                            <li key={item.id}>
                                <strong>{item.sender}</strong> <small>{item.room}</small>
                                <p>{item.body}</p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="overlay-empty">No new mentions or DMs.</p>
                );
            case "soundboard":
                return state.inCall ? (
                    <div className="overlay-sounds">
                        {state.sounds.map((sound) => (
                            <button key={sound.key} type="button" className="overlay-sound" disabled={pinnedMode} onClick={() => send({ type: "playSound", key: sound.key })} title={sound.name}>
                                <span aria-hidden="true">{sound.emoji}</span>
                                {sound.name}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="overlay-empty">Join a call to play sounds.</p>
                );
        }
    };

    return (
        <div className={`overlay-root${pinnedMode ? " is-pinned-mode" : ""}`} data-testid="overlay">
            {pinnedMode ? null : (
                <header className="overlay-bar" style={{ opacity }}>
                    {state.inCall ? (
                        <>
                            {barButton({ type: "toggleMute" }, "mic", state.micMuted ? "Unmute" : "Mute", state.micMuted)}
                            {barButton({ type: "toggleDeafen" }, "headphones", state.deafened ? "Undeafen" : "Deafen", state.deafened)}
                            {barButton({ type: "toggleCamera" }, "camera", state.cameraOn ? "Turn camera off" : "Turn camera on", state.cameraOn)}
                            {barButton({ type: "toggleScreenShare" }, "screen", state.sharing ? "Stop sharing" : "Share screen", state.sharing)}
                            {barButton({ type: "leave" }, "hangup", "Leave call", false, true)}
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
                    <button type="button" className="overlay-button" onClick={() => send({ type: "openApp" })} aria-label="Open Meadhall" title="Open Meadhall">
                        <PixelIcon name="home" size={20} />
                    </button>
                    <button type="button" className={`overlay-button${settingsOpen ? " is-active" : ""}`} onClick={() => setSettingsOpen((value) => !value)} aria-label="Overlay settings" title="Overlay settings">
                        <PixelIcon name="gear" size={20} />
                    </button>
                    <button type="button" className="overlay-close" onClick={close} aria-label="Close overlay (Esc)" title="Close (Esc)">
                        <CloseIcon size={18} />
                        <small>ESC</small>
                    </button>
                </header>
            )}

            {settingsOpen && !pinnedMode ? (
                <section className="overlay-settings" aria-label="Overlay settings" data-testid="overlay-settings">
                    <h2>Overlay</h2>
                    {WIDGETS.map(({ id, title }) => (
                        <label key={id} className="overlay-setting">
                            <input type="checkbox" checked={layout[id].visible} onChange={(event) => update(id)({ ...layout[id], visible: event.target.checked })} />
                            Show {title}
                        </label>
                    ))}
                    <label className="overlay-setting">
                        Opacity
                        <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} aria-label="Overlay opacity" />
                    </label>
                    <button type="button" className="overlay-reset" onClick={() => setLayout({ ...DEFAULT_LAYOUT })}>
                        Reset positions
                    </button>
                    <p className="overlay-empty">Open and close with {shortcut}. Pinned widgets stay on screen while you play.</p>
                </section>
            ) : null}

            {shown.map(({ id, title }) => (
                <Widget key={id} id={id} title={title} layout={layout[id]} pinnedMode={pinnedMode} opacity={opacity} onChange={update(id)}>
                    {body(id)}
                </Widget>
            ))}
            {pinnedMode ? null : <p className="overlay-hint">{shortcut} to close · drag widgets by their title · the pin keeps one on screen</p>}
        </div>
    );
}
