// SPDX-License-Identifier: AGPL-3.0-only
// The inbox (top bar): only your unread messages, grouped by conversation, like Discord's. Unreads or just @mentions;
// click a message to jump there, or mark a conversation (or everything) as read.
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { markRoomsRead } from "../../notifications/roomActions";
import { unreadConversations } from "../../notifications/unreadMessages";

interface InboxPanelProps {
    client: MatrixClient;
    rooms: Room[];
    isMuted: (roomId: string) => boolean;
    // e.g. "general · Mead Hall"; DMs just the name.
    describeRoom: (room: Room) => string;
    onOpenRoom: (roomId: string) => void;
    onClose: () => void;
}

function timeLabel(ts: number): string {
    const date = new Date(ts);
    const today = new Date();
    return date.toDateString() === today.toDateString()
        ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function InboxPanel({ client, rooms, isMuted, describeRoom, onOpenRoom, onClose }: InboxPanelProps): React.ReactElement {
    const [tab, setTab] = useState<"unreads" | "mentions">("unreads");
    const panelRef = useRef<HTMLDivElement | null>(null);
    const conversations = useMemo(() => unreadConversations(client, rooms, isMuted), [client, isMuted, rooms]);
    const shown = tab === "mentions" ? conversations.filter((conversation) => conversation.mentions > 0) : conversations;

    useEffect(() => {
        const onPointerDown = (event: PointerEvent): void => {
            const target = event.target as HTMLElement;
            if (!panelRef.current?.contains(target) && !target.closest("[data-inbox-toggle]")) onClose();
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return (
        <div className="inbox-panel" ref={panelRef} role="dialog" aria-label="Inbox" data-testid="inbox-panel">
            <header className="inbox-header">
                <h2>Inbox</h2>
                <div className="inbox-tabs" role="tablist">
                    {(["unreads", "mentions"] as const).map((option) => (
                        <button key={option} type="button" role="tab" aria-selected={tab === option} className={tab === option ? "is-active" : ""} onClick={() => setTab(option)}>
                            {option === "unreads" ? "Unreads" : "Mentions"}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className="inbox-mark-all"
                    disabled={shown.length === 0}
                    onClick={() => void markRoomsRead(client, shown.map((conversation) => conversation.room))}
                >
                    Mark all read
                </button>
            </header>
            <div className="inbox-list">
                {shown.length === 0 ? (
                    <p className="inbox-empty">{tab === "mentions" ? "No unread mentions." : "You're all caught up!"}</p>
                ) : (
                    shown.map((conversation) => (
                        <section key={conversation.room.roomId} className="inbox-conversation" data-testid="inbox-conversation">
                            <header>
                                <button type="button" className="inbox-room-name" onClick={() => onOpenRoom(conversation.room.roomId)}>
                                    {describeRoom(conversation.room)}
                                </button>
                                <span className="inbox-count">{conversation.count}</span>
                                <button type="button" className="inbox-mark-read" onClick={() => void markRoomsRead(client, [conversation.room])} aria-label={`Mark ${describeRoom(conversation.room)} as read`}>
                                    ✓
                                </button>
                            </header>
                            {conversation.messages.map((message) => (
                                <button
                                    key={message.eventId}
                                    type="button"
                                    className={`inbox-message${message.mentionsMe ? " is-mention" : ""}`}
                                    onClick={() => onOpenRoom(conversation.room.roomId)}
                                >
                                    <span className="inbox-message-meta">
                                        <strong>{message.senderName}</strong>
                                        <time>{timeLabel(message.ts)}</time>
                                    </span>
                                    <span className="inbox-message-body">{message.body}</span>
                                </button>
                            ))}
                        </section>
                    ))
                )}
            </div>
        </div>
    );
}
