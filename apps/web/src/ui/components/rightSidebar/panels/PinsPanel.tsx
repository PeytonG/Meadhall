// SPDX-License-Identifier: AGPL-3.0-only
// The pin panel (pin button at the top of a channel): every pinned message, newest pin first, also ones not loaded in
// the timeline yet (fetched from the server). Click one to jump to it; people who may pin can unpin from here.
import React, { useEffect, useState } from "react";
import { EventType, MatrixEvent, RoomStateEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { canPin, pinnedEventIds, setPinned } from "../../../../core/rooms/pins";

interface PinsPanelProps {
    room: Room;
    onJumpToEvent?: (eventId: string) => void;
}

interface PinnedItem {
    eventId: string;
    senderLabel: string;
    body: string;
    ts: number | null;
}

function bodyOf(event: MatrixEvent): string {
    const content = event.getContent() as { body?: unknown; msgtype?: unknown };
    if (event.isRedacted()) return "Message deleted";
    if (typeof content.body === "string" && content.body.length > 0) return content.body;
    if (event.isDecryptionFailure()) return "Couldn't decrypt this message";
    return event.getType() === EventType.Sticker ? "Sticker" : "Message";
}

async function loadEvent(client: MatrixClient, room: Room, eventId: string): Promise<MatrixEvent | null> {
    const loaded = room.findEventById(eventId);
    if (loaded) return loaded;
    try {
        const raw = await client.fetchRoomEvent(room.roomId, eventId);
        const event = new MatrixEvent(raw);
        await client.decryptEventIfNeeded(event);
        return event;
    } catch {
        return null;
    }
}

export function PinsPanel({ room, onJumpToEvent }: PinsPanelProps): React.ReactElement {
    const client = room.client;
    const [ids, setIds] = useState<string[]>(() => pinnedEventIds(room));
    const [items, setItems] = useState<PinnedItem[] | null>(null);

    useEffect(() => {
        const onState = (event: MatrixEvent): void => {
            if (event.getType() === EventType.RoomPinnedEvents) setIds(pinnedEventIds(room));
        };
        setIds(pinnedEventIds(room));
        room.currentState.on(RoomStateEvent.Events, onState);
        return () => {
            room.currentState.removeListener(RoomStateEvent.Events, onState);
        };
    }, [room]);

    useEffect(() => {
        let cancelled = false;
        void Promise.all(ids.map((eventId) => loadEvent(client, room, eventId))).then((events) => {
            if (cancelled) return;
            setItems(
                ids.map((eventId, index) => {
                    const event = events[index];
                    const senderId = event?.getSender() ?? "";
                    const member = room.getMember(senderId);
                    return {
                        eventId,
                        senderLabel: member?.rawDisplayName || member?.name || senderId || "Unknown",
                        body: event ? bodyOf(event) : "Message not available",
                        ts: event?.getTs() ?? null,
                    };
                }),
            );
        });
        return () => {
            cancelled = true;
        };
    }, [client, ids, room]);

    const mayPin = canPin(room, client.getSafeUserId());
    return (
        <div className="rs-panel" data-testid="pins-panel">
            <div className="rs-panel-header">
                <h2 className="rs-panel-title">Pinned messages</h2>
            </div>
            <div className="rs-pins-list">
                {items === null ? (
                    <div className="rs-empty-state">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="rs-empty-state">No pinned messages in this channel yet. Pin one from a message&apos;s ... menu.</div>
                ) : (
                    items.map((item) => (
                        <div className="rs-pin-item" key={item.eventId} data-testid="pinned-message">
                            <div className="rs-pin-head">
                                <span className="rs-pin-sender">{item.senderLabel}</span>
                                {item.ts ? <span className="rs-pin-time">{new Date(item.ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span> : null}
                            </div>
                            <p className="rs-pin-body">{item.body}</p>
                            <div className="rs-pin-actions">
                                {onJumpToEvent ? (
                                    <button type="button" className="rs-pin-action" onClick={() => onJumpToEvent(item.eventId)}>
                                        Jump
                                    </button>
                                ) : null}
                                {mayPin ? (
                                    <button type="button" className="rs-pin-action" onClick={() => void setPinned(client, room, item.eventId, false).catch(() => undefined)}>
                                        Unpin
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
