// SPDX-License-Identifier: AGPL-3.0-only
// A preview card for a Meadhall link (or a matrix.to / matrix: room or message link) in a message: the conversation,
// and for a message link who wrote it and how it starts. Only from what you can already read: rooms you're not in
// show as such. Clicking it opens the conversation at the message (AppShell catches the link).
import React, { useEffect, useState } from "react";
import { EventType, MatrixEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { thumbnailFromMxc } from "../../adapters/media";
import type { AppLink } from "../../utils/permalink";
import { Avatar } from "../Avatar";

interface AppLinkPreviewProps {
    client: MatrixClient;
    link: AppLink;
    href: string;
    grouped: boolean;
}

interface Linked {
    room: Room | null;
    sender?: string;
    senderId?: string;
    excerpt?: string;
    missing?: boolean;
}

const EXCERPT = 280;

function roomFor(client: MatrixClient, idOrAlias: string): Room | null {
    if (idOrAlias.startsWith("!")) return client.getRoom(idOrAlias);
    return client.getRooms().find((room) => room.getCanonicalAlias() === idOrAlias || room.getAltAliases().includes(idOrAlias)) ?? null;
}

function excerptOf(event: MatrixEvent): string {
    if (event.isRedacted()) return "Message deleted";
    const content = event.getContent() as { body?: unknown; msgtype?: string };
    if (event.getType() === EventType.Sticker) return "Sticker";
    if (content.msgtype === "m.image") return "Picture";
    if (content.msgtype === "m.video") return "Video";
    if (content.msgtype === "m.file" || content.msgtype === "m.audio") return "File";
    const body = typeof content.body === "string" ? content.body.replace(/\s+/g, " ").trim() : "";
    return body.length > EXCERPT ? `${body.slice(0, EXCERPT)}…` : body || "Message";
}

// The space a channel belongs to, for "#general · Mead Hall".
function spaceName(client: MatrixClient, room: Room): string | null {
    for (const parent of room.currentState.getStateEvents(EventType.SpaceParent)) {
        const space = client.getRoom(parent.getStateKey() ?? "");
        if (space?.name) return space.name;
    }
    return null;
}

export function AppLinkPreview({ client, link, href, grouped }: AppLinkPreviewProps): React.ReactElement {
    const [linked, setLinked] = useState<Linked>(() => ({ room: roomFor(client, link.room) }));

    useEffect(() => {
        let cancelled = false;
        const room = roomFor(client, link.room);
        if (!room || room.getMyMembership() !== "join") {
            setLinked({ room: null });
            return undefined;
        }
        if (!link.eventId) {
            setLinked({ room });
            return undefined;
        }
        const show = (event: MatrixEvent): void => {
            if (cancelled) return;
            const senderId = event.getSender() ?? "";
            setLinked({ room, senderId, sender: room.getMember(senderId)?.name ?? senderId, excerpt: excerptOf(event) });
        };
        const loaded = room.findEventById(link.eventId);
        if (loaded) {
            show(loaded);
        } else {
            setLinked({ room });
            void client
                .fetchRoomEvent(room.roomId, link.eventId)
                .then(async (raw) => {
                    const event = new MatrixEvent(raw);
                    await client.decryptEventIfNeeded(event);
                    show(event);
                })
                .catch(() => {
                    if (!cancelled) setLinked({ room, missing: true });
                });
        }
        return () => {
            cancelled = true;
        };
    }, [client, link.eventId, link.room]);

    const { room } = linked;
    const roomName = room?.name || "Conversation";
    const where = room ? spaceName(client, room) : null;
    const avatar = room ? thumbnailFromMxc(client, room.getMxcAvatarUrl(), 64, 64, "crop") : null;

    return (
        <a className={`timeline-link-preview timeline-app-link-preview${grouped ? " timeline-link-preview-grouped" : ""}`} href={href} data-testid="app-link-preview">
            <span className="timeline-app-link-avatar">
                <Avatar className="timeline-app-link-picture" name={linked.sender ?? roomName} src={linked.senderId ? null : avatar} seed={linked.senderId ?? room?.roomId ?? link.room} userId={linked.senderId} />
            </span>
            <span className="timeline-link-preview-body">
                <span className="timeline-link-preview-site">
                    {room ? `Meadhall · ${where ? `${roomName} · ${where}` : roomName}` : "Meadhall link"}
                </span>
                <span className="timeline-link-preview-title">
                    {!room ? "A conversation you're not in" : linked.sender ? linked.sender : link.eventId ? (linked.missing ? "Message not found" : "Loading message…") : roomName}
                </span>
                {linked.excerpt ? <span className="timeline-link-preview-description">{linked.excerpt}</span> : null}
                <span className="timeline-link-preview-host">{link.eventId ? "Jump to message" : "Open conversation"}</span>
            </span>
        </a>
    );
}
