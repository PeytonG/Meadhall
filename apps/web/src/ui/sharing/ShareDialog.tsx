// SPDX-License-Identifier: AGPL-3.0-only
// Share a sound or style profile with friends: pick one or more chats and it's sent there as a card they can adopt.
import React, { useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { shareToRooms } from "../../core/sharing/share";
import type { MeadhallItem } from "../../core/sharing/meadhallFile";
import { RoomDialog } from "../components/rooms/RoomDialog";

interface ShareDialogProps {
    client: MatrixClient;
    // Built when sending (sounds are downloaded then), so opening the dialog is instant.
    prepare: () => Promise<MeadhallItem>;
    title: string;
    // Save it as a .meadhall file on this device instead.
    onExport?: () => Promise<void>;
    onClose: () => void;
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

function chatsYouCanPostIn(client: MatrixClient): Room[] {
    const me = client.getUserId() ?? "";
    return client
        .getRooms()
        .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === "join" && room.getType() !== "io.github.peytong.meadhall.bug_report")
        .filter((room) => room.currentState.maySendMessage(me))
        .sort((left, right) => right.getLastActiveTimestamp() - left.getLastActiveTimestamp());
}

export function ShareDialog({ client, prepare, title, onExport, onClose, onToast }: ShareDialogProps): React.ReactElement {
    const rooms = useMemo(() => chatsYouCanPostIn(client), [client]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const shown = rooms.filter((room) => room.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);

    const toggle = (roomId: string): void =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(roomId)) next.delete(roomId);
            else next.add(roomId);
            return next;
        });

    const send = async (): Promise<void> => {
        setSending(true);
        setError(null);
        try {
            const item = await prepare();
            const failed = await shareToRooms(client, [...selected], item);
            const sent = selected.size - failed.length;
            if (sent > 0) onToast({ type: "success", message: `Shared "${item.name}" in ${sent} chat${sent === 1 ? "" : "s"}.` });
            if (failed.length > 0) setError(`Couldn't post in ${failed.length} chat${failed.length === 1 ? "" : "s"}.`);
            else onClose();
        } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : "Couldn't share it.");
        } finally {
            setSending(false);
        }
    };

    return (
        <RoomDialog
            open
            title={title}
            onClose={onClose}
            footer={
                <>
                    {onExport ? (
                        <button
                            type="button"
                            className="room-dialog-button room-dialog-button-secondary"
                            onClick={() => void onExport().catch((exportError: unknown) => setError(exportError instanceof Error ? exportError.message : "Couldn't save the file."))}
                            disabled={sending}
                        >
                            Save as file
                        </button>
                    ) : null}
                    <button type="button" className="room-dialog-button room-dialog-button-secondary" onClick={onClose} disabled={sending}>
                        Cancel
                    </button>
                    <button type="button" className="room-dialog-button room-dialog-button-primary" onClick={() => void send()} disabled={sending || selected.size === 0}>
                        {sending ? "Sharing..." : selected.size > 1 ? `Share in ${selected.size} chats` : "Share"}
                    </button>
                </>
            }
        >
            <p className="room-dialog-muted">Pick who to share it with. They can add it with one click.</p>
            <input className="room-dialog-input" type="search" placeholder="Find a chat" aria-label="Find a chat" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="share-dialog-list" role="group" aria-label="Chats">
                {shown.length === 0 ? <p className="room-dialog-muted">No chats found.</p> : null}
                {shown.map((room) => (
                    <label key={room.roomId} className="share-dialog-row">
                        <input type="checkbox" checked={selected.has(room.roomId)} onChange={() => toggle(room.roomId)} disabled={sending} />
                        <span>{room.name || room.roomId}</span>
                    </label>
                ))}
            </div>
            {error ? <p className="room-dialog-error">{error}</p> : null}
        </RoomDialog>
    );
}
