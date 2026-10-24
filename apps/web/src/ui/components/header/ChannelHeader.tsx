import React, { useEffect, useMemo, useRef, useState } from "react";
import { EventType, type Room } from "matrix-js-sdk/src/matrix";

import type { RightSidebarMode } from "../rightPanel/types";
import { PixelIcon } from "../PixelIcon";

interface ChannelHeaderProps {
    room: Room | null;
    isDirectMessage: boolean;
    showHashPrefix: boolean;
    sidebarMode: RightSidebarMode;
    searchQuery: string;
    canInviteInRoom: boolean;
    onSearchQueryChange: (value: string) => void;
    onSelectSidebarMode: (mode: RightSidebarMode) => void;
    onOpenDirectChat: () => void;
    onOpenCreateRoom: () => void;
    onOpenJoinRoom: () => void;
    onOpenInviteUsers: () => void;
    onOpenRoomSettings: () => void;
    onOpenModeration: () => void;
    onCopyRoomLink: () => Promise<void>;
    onLeaveRoom: () => Promise<void>;
    // DM, group chat and plain-room calls (voice channels join on click instead). Undefined hides the button.
    call?: { inCall: boolean; othersInCall: number; onStartCall: () => void };
    // Shown when the room has no topic (e.g. "Group chat · 3 members").
    subtitle?: string;
    // Phone layout: back to the channel list (the button is hidden on wider screens).
    onMobileBack?: () => void;
}

type HeaderIconKind = "search" | "pins" | "members" | "info" | "more";

function getRoomName(room: Room | null): string {
    if (!room) {
        return "No room selected";
    }

    return room.name || room.getCanonicalAlias() || room.roomId;
}

function getRoomTopic(room: Room | null): string {
    if (!room) {
        return "";
    }

    const topicEvent = room.currentState.getStateEvents(EventType.RoomTopic, "");
    const content = (topicEvent?.getContent() ?? {}) as { topic?: unknown };
    return typeof content.topic === "string" ? content.topic : "";
}

function isEncrypted(room: Room | null): boolean {
    if (!room) {
        return false;
    }

    return Boolean(room.currentState.getStateEvents(EventType.RoomEncryption, ""));
}

function HeaderIcon({ kind }: { kind: HeaderIconKind }): React.ReactElement {
    if (kind === "more") {
        return <span aria-hidden="true">{"\u22EF"}</span>;
    }

    if (kind === "search") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6" />
                <path d="M16 16l5 5" />
            </svg>
        );
    }

    if (kind === "pins") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 4h6v5l3 3v1H6v-1l3-3V4z" />
                <path d="M12 13v7" />
            </svg>
        );
    }

    if (kind === "members") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="9" r="2.5" />
                <circle cx="16.5" cy="10.5" r="2" />
                <path d="M4.5 18c0-2.5 2.2-4 4.5-4s4.5 1.5 4.5 4" />
                <path d="M14 17.5c.5-1.8 1.7-2.8 3.5-3.2" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 1 0 12 8.5z" />
            <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.4.1z" />
        </svg>
    );
}

export function ChannelHeader({
    room,
    isDirectMessage,
    showHashPrefix,
    sidebarMode,
    searchQuery,
    canInviteInRoom,
    onSearchQueryChange,
    onSelectSidebarMode,
    onOpenDirectChat,
    onOpenCreateRoom,
    onOpenJoinRoom,
    onOpenInviteUsers,
    onOpenRoomSettings,
    onOpenModeration,
    onCopyRoomLink,
    onLeaveRoom,
    call,
    subtitle,
    onMobileBack,
}: ChannelHeaderProps): React.ReactElement {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const roomName = getRoomName(room);
    const topic = getRoomTopic(room);
    const encrypted = isEncrypted(room);
    const titlePrefix = room
        ? isDirectMessage
            ? "@ "
            : showHashPrefix
                ? "# "
                : ""
        : "";

    const secondaryText = useMemo(() => {
        if (topic.trim().length > 0) {
            return topic.trim();
        }
        if (room) {
            return subtitle ?? (isDirectMessage ? "Direct message" : "No topic set");
        }
        return "Select a room to start chatting";
    }, [isDirectMessage, room, subtitle, topic]);

    useEffect(() => {
        if (sidebarMode !== "search") {
            return;
        }

        searchInputRef.current?.focus();
    }, [sidebarMode]);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }

        const onMouseDown = (event: MouseEvent): void => {
            const target = event.target as Node | null;
            if (!target || menuRef.current?.contains(target)) {
                return;
            }
            setMenuOpen(false);
        };

        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                setMenuOpen(false);
            }
        };

        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [menuOpen]);

    const toggleMode = (mode: RightSidebarMode): void => {
        onSelectSidebarMode(sidebarMode === mode ? "closed" : mode);
    };

    return (
        <header className="channel-header">
            {onMobileBack ? (
                <button type="button" className="channel-header-back" onClick={onMobileBack} aria-label="Back to channels" title="Back">
                    <PixelIcon name="back" size={18} />
                </button>
            ) : null}
            <div className="channel-header-main">
                <div className="channel-header-title-row">
                    <h1 className="channel-header-title">{`${titlePrefix}${roomName}`}</h1>
                    {room && encrypted ? (
                        <span className="channel-header-chip channel-header-chip-encrypted" data-testid="encryption-chip">
                            <span aria-hidden="true">{"\uD83D\uDD12"}</span>
                            Encrypted
                        </span>
                    ) : null}
                    {/* Unencrypted rooms say so too: the server (and its admins) can read them. */}
                    {room && !encrypted ? (
                        <span
                            className="channel-header-chip channel-header-chip-unencrypted"
                            data-testid="encryption-chip"
                            title="Not end-to-end encrypted: the server can read messages here"
                        >
                            <span aria-hidden="true">{"\uD83D\uDD13"}</span>
                            Unencrypted
                        </span>
                    ) : null}
                </div>
                <p className="channel-header-topic" title={secondaryText}>
                    {secondaryText}
                </p>
            </div>

            <div className="channel-header-actions">
                {room && call && !call.inCall ? (
                    <button
                        type="button"
                        className={`channel-header-icon-btn channel-header-call-btn${call.othersInCall > 0 ? " is-live" : ""}`}
                        aria-label={call.othersInCall > 0 ? "Join call" : "Start call"}
                        title={call.othersInCall > 0 ? "Join call" : "Start call"}
                        onClick={call.onStartCall}
                        data-testid="header-call"
                    >
                        <PixelIcon name="phone" size={18} />
                    </button>
                ) : null}
                {sidebarMode === "search" ? (
                    <input
                        ref={searchInputRef}
                        className="channel-header-search"
                        placeholder="Search messages..."
                        aria-label="Search messages"
                        value={searchQuery}
                        onChange={(event) => onSearchQueryChange(event.target.value)}
                    />
                ) : null}

                <button
                    type="button"
                    className={`channel-header-icon-btn${sidebarMode === "search" ? " is-active" : ""}`}
                    aria-label="Search panel"
                    title="Search"
                    onClick={() => toggleMode("search")}
                    disabled={!room}
                >
                    <HeaderIcon kind="search" />
                </button>
                <button
                    type="button"
                    className={`channel-header-icon-btn${sidebarMode === "pins" ? " is-active" : ""}`}
                    aria-label="Pins panel"
                    title="Pins"
                    onClick={() => toggleMode("pins")}
                    disabled={!room}
                >
                    <HeaderIcon kind="pins" />
                </button>
                <button
                    type="button"
                    className={`channel-header-icon-btn${sidebarMode === "members" ? " is-active" : ""}`}
                    aria-label="Members panel"
                    title="Members"
                    onClick={() => toggleMode("members")}
                    disabled={!room}
                >
                    <HeaderIcon kind="members" />
                </button>
                <button
                    type="button"
                    className={`channel-header-icon-btn${sidebarMode === "info" ? " is-active" : ""}`}
                    aria-label="Channel info panel"
                    title="Channel info"
                    onClick={() => toggleMode("info")}
                    disabled={!room}
                >
                    <HeaderIcon kind="info" />
                </button>

                <div className="channel-header-menu" ref={menuRef}>
                    <button
                        type="button"
                        className={`channel-header-icon-btn${menuOpen ? " is-active" : ""}`}
                        aria-label="More channel actions"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        title="More"
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        <HeaderIcon kind="more" />
                    </button>
                    {menuOpen ? (
                        <div className="channel-header-menu-panel" role="menu">
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    onOpenDirectChat();
                                    setMenuOpen(false);
                                }}
                            >
                                New direct chat
                            </button>
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    onOpenCreateRoom();
                                    setMenuOpen(false);
                                }}
                            >
                                Create room
                            </button>
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                onClick={() => {
                                    onOpenJoinRoom();
                                    setMenuOpen(false);
                                }}
                            >
                                Join room
                            </button>
                            <hr className="channel-header-menu-divider" />
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                disabled={!room || !canInviteInRoom}
                                onClick={() => {
                                    onOpenInviteUsers();
                                    setMenuOpen(false);
                                }}
                            >
                                Invite users
                            </button>
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                disabled={!room}
                                onClick={() => {
                                    onOpenRoomSettings();
                                    setMenuOpen(false);
                                }}
                            >
                                Channel settings
                            </button>
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                disabled={!room}
                                onClick={() => {
                                    onOpenModeration();
                                    setMenuOpen(false);
                                }}
                            >
                                Moderation
                            </button>
                            <hr className="channel-header-menu-divider" />
                            <button
                                type="button"
                                className="channel-header-menu-item"
                                role="menuitem"
                                disabled={!room}
                                onClick={() => {
                                    void onCopyRoomLink();
                                    setMenuOpen(false);
                                }}
                            >
                                Copy link
                            </button>
                            <button
                                type="button"
                                className="channel-header-menu-item channel-header-menu-item-danger"
                                role="menuitem"
                                disabled={!room}
                                onClick={() => {
                                    void onLeaveRoom();
                                    setMenuOpen(false);
                                }}
                            >
                                Leave room
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
