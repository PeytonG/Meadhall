// SPDX-License-Identifier: AGPL-3.0-only
// The Home view's sidebar, like Discord's: a conversation filter, then Direct Messages (one-to-one) and Group Chats
// (DMs with more people, and rooms outside any server). Shows unread counts, presence and live calls.
import React, { useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { roomAvatarSources } from "../adapters/avatar";
import { toAvatarPresenceState } from "../presence/buildPresenceVm";
import { isPresenceEnabledForClient } from "../presence/presenceConfig";
import { usePresenceMap } from "../presence/usePresence";
import { useMatrix } from "../providers/MatrixProvider";
import { Avatar } from "./Avatar";
import { PixelIcon } from "./PixelIcon";
import { lastMessageSnippet } from "./lastMessageSnippet";
import { getServerUnreadCount } from "./RoomList";

interface HomeSidebarProps {
    client: MatrixClient;
    directRooms: Room[];
    otherRooms: Room[];
    activeRoomId: string | null;
    // roomId -> user IDs in that room's call.
    roomCalls: Map<string, string[]>;
    currentCallRoomId: string | null;
    onSelectRoom: (roomId: string) => void;
    onNewConversation: () => void;
}

function getRoomName(room: Room): string {
    return room.name || room.getCanonicalAlias() || room.roomId;
}

function otherMembers(room: Room, ownUserId: string): string[] {
    return room
        .getMembers()
        .filter((member) => member.userId !== ownUserId)
        .filter((member) => member.membership === "join" || member.membership === "invite")
        .map((member) => member.userId);
}

// A DM with exactly one other person is a direct message; anything bigger is a group chat.
export function isOneToOneRoom(room: Room, ownUserId: string): boolean {
    return otherMembers(room, ownUserId).length <= 1;
}

interface RowProps {
    client: MatrixClient;
    room: Room;
    isActive: boolean;
    subtitle: string;
    callLive: boolean;
    presenceUserId: string | null;
    presenceState: ReturnType<typeof toAvatarPresenceState>;
    onSelect: () => void;
}

function HomeRow({ client, room, isActive, subtitle, callLive, presenceUserId, presenceState, onSelect }: RowProps): React.ReactElement {
    const name = getRoomName(room);
    const avatarSources = roomAvatarSources(client, room, 64, true);
    const unread = getServerUnreadCount(room);
    return (
        <button
            type="button"
            className={`home-row${isActive ? " is-active" : ""}${unread > 0 ? " has-unread" : ""}`}
            onClick={onSelect}
            title={name}
            data-testid="home-row"
        >
            <Avatar
                className="home-row-avatar"
                name={name}
                src={avatarSources[0] ?? null}
                sources={avatarSources}
                seed={presenceUserId ?? room.roomId}
                userId={presenceUserId ?? undefined}
                presenceState={presenceState}
            />
            <span className="home-row-text">
                <span className="home-row-name">{name}</span>
                <span className={`home-row-subtitle${callLive ? " is-call" : ""}`}>
                    {callLive ? <PixelIcon name="phone" size={12} /> : null}
                    {subtitle}
                </span>
            </span>
            {unread > 0 ? <span className="home-row-unread">{unread > 99 ? "99+" : unread}</span> : null}
        </button>
    );
}

export function HomeSidebar({
    client,
    directRooms,
    otherRooms,
    activeRoomId,
    roomCalls,
    currentCallRoomId,
    onSelectRoom,
    onNewConversation,
}: HomeSidebarProps): React.ReactElement {
    const { config } = useMatrix();
    const ownUserId = client.getUserId() ?? "";
    const [filter, setFilter] = useState("");
    const presenceEnabled = useMemo(() => isPresenceEnabledForClient(config, client), [client, config]);

    const { oneToOne, groups } = useMemo(() => {
        const query = filter.trim().toLowerCase();
        const matches = (room: Room): boolean => !query || getRoomName(room).toLowerCase().includes(query);
        return {
            oneToOne: directRooms.filter((room) => isOneToOneRoom(room, ownUserId)).filter(matches),
            groups: [...directRooms.filter((room) => !isOneToOneRoom(room, ownUserId)), ...otherRooms].filter(matches),
        };
    }, [directRooms, filter, otherRooms, ownUserId]);

    const partnerByRoomId = useMemo(() => {
        const partners = new Map<string, string>();
        for (const room of oneToOne) {
            const partner = otherMembers(room, ownUserId)[0];
            if (partner) {
                partners.set(room.roomId, partner);
            }
        }
        return partners;
    }, [oneToOne, ownUserId]);
    const presenceByUserId = usePresenceMap(client, [...new Set(partnerByRoomId.values())], presenceEnabled);

    const callSubtitle = (room: Room): string | null => {
        const inCall = roomCalls.get(room.roomId) ?? [];
        if (currentCallRoomId === room.roomId) {
            return "In call with you";
        }
        return inCall.length > 0 ? `In a call (${inCall.length})` : null;
    };

    const renderRows = (rooms: Room[], kind: "direct" | "group"): React.ReactNode =>
        rooms.map((room) => {
            const partner = partnerByRoomId.get(room.roomId) ?? null;
            const presence = partner ? presenceByUserId.get(partner) : undefined;
            const call = callSubtitle(room);
            const invite = room.getMyMembership() === "invite";
            const memberCount = otherMembers(room, ownUserId).length + 1;
            // Status first (their custom status, presence, or member count), then the latest message.
            const status =
                kind === "group"
                    ? `${memberCount} members`
                    : presenceEnabled && presence
                      ? presence.statusText ?? presence.primaryLabel
                      : "Direct message";
            const snippet = invite ? null : lastMessageSnippet(room, ownUserId, { showSender: kind === "group" });
            const subtitle = call ?? (invite ? "Invite: open to accept" : snippet ? `${status} · ${snippet}` : status);
            return (
                <HomeRow
                    key={room.roomId}
                    client={client}
                    room={room}
                    isActive={room.roomId === activeRoomId}
                    subtitle={subtitle}
                    callLive={call !== null}
                    presenceUserId={partner}
                    presenceState={presenceEnabled && kind === "direct" ? toAvatarPresenceState(presence) : null}
                    onSelect={() => onSelectRoom(room.roomId)}
                />
            );
        });

    return (
        <div className="home-sidebar">
            <div className="home-search">
                <input
                    type="search"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Find a conversation"
                    aria-label="Find a conversation"
                />
            </div>
            <div className="home-sections">
                <section className="home-section" aria-label="Direct messages">
                    <header className="home-section-header">
                        <span>Direct Messages</span>
                        <button type="button" onClick={onNewConversation} title="New direct message" aria-label="New direct message">
                            <PixelIcon name="plus" size={12} />
                        </button>
                    </header>
                    {oneToOne.length > 0 ? (
                        renderRows(oneToOne, "direct")
                    ) : (
                        <p className="home-empty">{filter ? "No matches." : "No direct messages yet. Press + to start one."}</p>
                    )}
                </section>
                <section className="home-section" aria-label="Group chats">
                    <header className="home-section-header">
                        <span>Group Chats</span>
                        <button type="button" onClick={onNewConversation} title="New group chat" aria-label="New group chat">
                            <PixelIcon name="plus" size={12} />
                        </button>
                    </header>
                    {groups.length > 0 ? (
                        renderRows(groups, "group")
                    ) : (
                        <p className="home-empty">{filter ? "No matches." : "No group chats yet. Add two or more people to start one."}</p>
                    )}
                </section>
            </div>
        </div>
    );
}
