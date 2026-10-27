// SPDX-License-Identifier: AGPL-3.0-only
// A thread beside the chat, like Discord's: its first message and every reply, with its own message box.
import React, { useEffect, useState } from "react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import { Composer } from "../components/Composer";
import { Timeline } from "../components/Timeline";
import type { LinkPreviewMode } from "../settings/user/settingsStore";

interface ThreadPanelProps {
    client: MatrixClient;
    room: Room;
    rootEventId: string;
    activeSpaceId: string | null;
    customReactionImagesEnabled: boolean;
    linkPreviews: LinkPreviewMode;
    onSelectUser?: (userId: string) => void;
    onClose: () => void;
}

function rootPreview(room: Room, rootEventId: string): string {
    const body = room.findEventById(rootEventId)?.getContent().body;
    return typeof body === "string" ? body.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export function ThreadPanel({
    client,
    room,
    rootEventId,
    activeSpaceId,
    customReactionImagesEnabled,
    linkPreviews,
    onSelectUser,
    onClose,
}: ThreadPanelProps): React.ReactElement {
    const [replyToEvent, setReplyToEvent] = useState<MatrixEvent | null>(null);
    const [editingEvent, setEditingEvent] = useState<MatrixEvent | null>(null);

    useEffect(() => {
        setReplyToEvent(null);
        setEditingEvent(null);
    }, [rootEventId]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "Escape" && !event.defaultPrevented && !(event.target as HTMLElement | null)?.closest("textarea, input")) {
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const preview = rootPreview(room, rootEventId);
    return (
        <aside className="thread-panel" aria-label="Thread" data-testid="thread-panel">
            <header className="thread-panel-header">
                <span className="thread-panel-title">
                    <span aria-hidden="true">🧵</span> Thread
                </span>
                {preview ? <span className="thread-panel-root">{preview}</span> : null}
                <button type="button" className="thread-panel-close" onClick={onClose} aria-label="Close thread" title="Close thread">
                    ×
                </button>
            </header>
            <Timeline
                client={client}
                room={room}
                threadRootId={rootEventId}
                replyToEventId={replyToEvent?.getId() ?? null}
                onReply={(event) => {
                    setEditingEvent(null);
                    setReplyToEvent(event);
                }}
                onEdit={(event) => {
                    setReplyToEvent(null);
                    setEditingEvent(event);
                }}
                onSelectUser={onSelectUser}
                activeSpaceId={activeSpaceId}
                customReactionImagesEnabled={customReactionImagesEnabled}
                showReadReceipts={false}
                linkPreviews={linkPreviews}
            />
            <div className="thread-panel-composer">
                <Composer
                    client={client}
                    room={room}
                    threadId={rootEventId}
                    activeSpaceId={activeSpaceId}
                    editingEvent={editingEvent}
                    onCancelEdit={() => setEditingEvent(null)}
                    replyToEvent={replyToEvent}
                    onCancelReply={() => setReplyToEvent(null)}
                />
            </div>
        </aside>
    );
}
