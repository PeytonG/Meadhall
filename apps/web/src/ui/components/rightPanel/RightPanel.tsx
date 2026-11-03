import React from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import type { RightPanelMode } from "../../hooks/useSelectedUser";
import { MembersPanel } from "../rightSidebar/panels/MembersPanel";
import { SearchPanel } from "../rightSidebar/panels/SearchPanel";
import { PinsPanel } from "../rightSidebar/panels/PinsPanel";
import { InfoPanel } from "../rightSidebar/panels/InfoPanel";
import type { RightSidebarMode } from "./types";
import { UserProfilePanel } from "./UserProfilePanel";

interface RightPanelProps {
    client: MatrixClient;
    room: Room | null;
    activeSpaceRoom: Room | null;
    mode: RightPanelMode;
    roomMode: RightSidebarMode;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    onSelectUser: (userId: string) => void;
    onBackToRoom: () => void;
    onOpenRoomSettings: () => void;
    onCopyRoomLink: () => Promise<void>;
    onLeaveRoom: () => Promise<void>;
    onOpenRoom: (roomId: string) => void;
    onToast?: (toast: { type: "success" | "error" | "info"; message: string }) => void;
    onCallUser?: (userId: string) => void;
    // The pin panel's Jump: show that message in the timeline.
    onJumpToEvent?: (eventId: string) => void;
    // Desktop: drag the panel's left edge to resize it (AppShell, usePaneWidth).
    onResizeStart?: (event: React.PointerEvent<HTMLElement>) => void;
}

export function RightPanel({
    client,
    room,
    activeSpaceRoom,
    mode,
    roomMode,
    searchQuery,
    onSearchQueryChange,
    onSelectUser,
    onBackToRoom,
    onOpenRoomSettings,
    onCopyRoomLink,
    onLeaveRoom,
    onOpenRoom,
    onToast,
    onCallUser,
    onJumpToEvent,
    onResizeStart,
}: RightPanelProps): React.ReactElement {
    const handle = onResizeStart ? <div className="right-panel-resize-handle" onPointerDown={onResizeStart} data-testid="right-panel-resize" /> : null;
    if (!room) {
        return (
            <aside className="right-panel">
                {handle}
                <div className="right-panel-empty">Select a room to view room info.</div>
            </aside>
        );
    }

    return (
        <aside className="right-panel">
            {handle}
            {mode.mode === "user" ? (
                <UserProfilePanel
                    client={client}
                    room={room}
                    activeSpaceRoom={activeSpaceRoom}
                    userId={mode.userId}
                    onBack={onBackToRoom}
                    onOpenRoom={onOpenRoom}
                    onToast={onToast}
                    onCallUser={onCallUser}
                />
            ) : (
                <>
                    {roomMode === "members" ? (
                        <MembersPanel
                            client={client}
                            room={room}
                            activeSpaceRoom={activeSpaceRoom}
                            onSelectUser={onSelectUser}
                            onToast={onToast}
                        />
                    ) : null}
                    {roomMode === "search" ? (
                        <SearchPanel
                            room={room}
                            query={searchQuery}
                            onQueryChange={onSearchQueryChange}
                        />
                    ) : null}
                    {roomMode === "pins" ? <PinsPanel room={room} onJumpToEvent={onJumpToEvent} /> : null}
                    {roomMode === "info" ? (
                        <InfoPanel
                            client={client}
                            room={room}
                            onOpenRoomSettings={onOpenRoomSettings}
                            onCopyRoomLink={onCopyRoomLink}
                            onLeaveRoom={onLeaveRoom}
                        />
                    ) : null}
                </>
            )}
        </aside>
    );
}
