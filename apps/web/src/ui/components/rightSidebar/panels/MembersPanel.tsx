import React, { useMemo, useState } from "react";
import { readAssignments, readRoles, setMemberRoles } from "../../../../core/roles/applyRoles";
import { MEMBER_ROLES_EVENT, ROLES_EVENT, type Role } from "../../../../core/roles/roles";
import { EventType, type MatrixClient, type Room, type RoomMember } from "matrix-js-sdk/src/matrix";

import { memberAvatarSources } from "../../../adapters/avatar";
import { useMatrix } from "../../../providers/MatrixProvider";
import { toAvatarPresenceState } from "../../../presence/buildPresenceVm";
import { isPresenceEnabledForClient } from "../../../presence/presenceConfig";
import { usePresenceMap } from "../../../presence/usePresence";
import { Avatar } from "../../Avatar";
import { useRoomStateVersion } from "../../../hooks/useRoomStateVersion";
import { ContextMenu, type ContextMenuItem } from "../../menus/ContextMenu";
import { UserBadges } from "../../badges/UserBadges";

interface MembersPanelProps {
    client: MatrixClient;
    room: Room;
    activeSpaceRoom: Room | null;
    onSelectUser: (userId: string) => void;
    onToast?: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

function getVisibleMembers(room: Room): RoomMember[] {
    return room
        .getMembers()
        .filter((member) => member.membership === "join" || member.membership === "invite");
}

function getUserPowerLevel(room: Room | null, userId: string): number {
    if (!room) {
        return 0;
    }

    const powerLevelsEvent = room.currentState.getStateEvents(EventType.RoomPowerLevels, "");
    const content = (powerLevelsEvent?.getContent() ?? {}) as {
        users?: Record<string, number>;
        users_default?: number;
    };

    const directLevel = content.users?.[userId];
    if (typeof directLevel === "number" && Number.isFinite(directLevel)) {
        return directLevel;
    }

    return typeof content.users_default === "number" && Number.isFinite(content.users_default) ? content.users_default : 0;
}

function getRoleLabel(level: number): string {
    if (level >= 100) {
        return "Admin";
    }
    if (level >= 50) {
        return "Mod";
    }
    return "Member";
}

function displayNameOf(member: RoomMember): string {
    return member.rawDisplayName || member.name || member.userId;
}

// The server's channels you're in (role changes are applied to their power levels too).
function spaceChannels(client: MatrixClient, space: Room): Room[] {
    return space.currentState
        .getStateEvents(EventType.SpaceChild)
        .map((event) => client.getRoom(event.getStateKey() ?? ""))
        .filter((room): room is Room => Boolean(room && room.getMyMembership() === "join"));
}

interface MemberGroup {
    title: string;
    members: RoomMember[];
    offline: boolean;
}

export function MembersPanel({ client, room, activeSpaceRoom, onSelectUser, onToast }: MembersPanelProps): React.ReactElement {
    const { config } = useMatrix();
    // Re-read members and roles when they change (role changes, joins, name changes).
    const stateVersion = useRoomStateVersion(useMemo(() => (activeSpaceRoom ? [room, activeSpaceRoom] : [room]), [activeSpaceRoom, room]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const members = useMemo(() => getVisibleMembers(room), [room, stateVersion]);
    const roleSourceRoom = activeSpaceRoom ?? room;
    // Discord-style: names in their highest role's color, grouped under their highest role, highest rank first.
    const spaceRoles = useMemo(() => (activeSpaceRoom ? [...readRoles(activeSpaceRoom)].sort((left, right) => right.rank - left.rank) : []), [activeSpaceRoom, members, stateVersion]);
    const roleAssignments = activeSpaceRoom ? readAssignments(activeSpaceRoom, spaceRoles) : new Map<string, string[]>();
    const topRole = (userId: string): Role | null => {
        const held = roleAssignments.get(userId) ?? [];
        return spaceRoles.find((role) => held.includes(role.id)) ?? null;
    };
    const presenceEnabled = useMemo(() => isPresenceEnabledForClient(config, client), [client, config]);
    const presenceByUserId = usePresenceMap(
        client,
        members.map((member) => member.userId),
        presenceEnabled,
    );
    const [menu, setMenu] = useState<{ userId: string; x: number; y: number } | null>(null);
    const [busy, setBusy] = useState(false);

    // Highest rank first: their top role, then their power level, then by name.
    const orderedMembers = useMemo(() => {
        const rank = (member: RoomMember): number => topRole(member.userId)?.rank ?? 0;
        return [...members].sort(
            (left, right) =>
                rank(right) - rank(left) ||
                getUserPowerLevel(roleSourceRoom, right.userId) - getUserPowerLevel(roleSourceRoom, left.userId) ||
                displayNameOf(left).localeCompare(displayNameOf(right), undefined, { sensitivity: "base" }),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members, roleSourceRoom, spaceRoles]);

    // Like Discord: a section per role (people online with that as their top role), then Online, then Offline.
    const groups = useMemo((): MemberGroup[] => {
        const isOffline = (member: RoomMember): boolean => {
            if (!presenceEnabled) return false;
            const state = toAvatarPresenceState(presenceByUserId.get(member.userId));
            return state === null || state === "offline";
        };
        const online = orderedMembers.filter((member) => !isOffline(member));
        const offline = orderedMembers.filter(isOffline);
        const result: MemberGroup[] = [];
        for (const role of spaceRoles) {
            const inRole = online.filter((member) => topRole(member.userId)?.id === role.id);
            if (inRole.length > 0) result.push({ title: `${role.name} — ${inRole.length}`, members: inRole, offline: false });
        }
        const rest = online.filter((member) => !topRole(member.userId));
        if (rest.length > 0) result.push({ title: `${presenceEnabled ? "Online" : "Members"} — ${rest.length}`, members: rest, offline: false });
        if (offline.length > 0) result.push({ title: `Offline — ${offline.length}`, members: offline, offline: true });
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderedMembers, presenceByUserId, presenceEnabled, spaceRoles]);

    const me = client.getUserId() ?? "";
    const canManageRoles = Boolean(
        activeSpaceRoom &&
            spaceRoles.length > 0 &&
            activeSpaceRoom.currentState.maySendStateEvent(ROLES_EVENT, me) &&
            activeSpaceRoom.currentState.maySendStateEvent(MEMBER_ROLES_EVENT, me) &&
            activeSpaceRoom.currentState.maySendStateEvent(EventType.RoomPowerLevels, me),
    );

    const toggleRole = async (userId: string, role: Role, give: boolean): Promise<void> => {
        if (!activeSpaceRoom) return;
        const held = roleAssignments.get(userId) ?? [];
        setBusy(true);
        try {
            await setMemberRoles(client, activeSpaceRoom, spaceChannels(client, activeSpaceRoom), userId, give ? [...held, role.id] : held.filter((id) => id !== role.id));
            onToast?.({ type: "success", message: give ? `${role.name} given.` : `${role.name} removed.` });
        } catch (error) {
            onToast?.({ type: "error", message: error instanceof Error ? error.message : "Couldn't change roles." });
        } finally {
            setBusy(false);
        }
    };

    const menuItems = (userId: string): ContextMenuItem[] => {
        const held = roleAssignments.get(userId) ?? [];
        return [
            { label: "Profile", onSelect: () => onSelectUser(userId) },
            ...(canManageRoles
                ? ([
                      {
                          label: "Roles",
                          testId: "member-menu-roles",
                          submenu: spaceRoles.map((role) => ({
                              label: role.name,
                              checked: held.includes(role.id),
                              disabled: busy,
                              onSelect: () => void toggleRole(userId, role, !held.includes(role.id)),
                          })),
                      },
                  ] as ContextMenuItem[])
                : []),
            { kind: "separator" },
            { label: "Copy user ID", onSelect: () => void navigator.clipboard?.writeText(userId) },
        ];
    };

    const openMenu = (userId: string, x: number, y: number): void => setMenu({ userId, x, y });

    return (
        <div className="rs-panel">
            <div className="rs-panel-header">
                <h2 className="rs-panel-title">Members - {orderedMembers.length}</h2>
            </div>
            <div className="rs-members-list">
                {groups.map((group) => (
                    <React.Fragment key={group.title}>
                        <h3 className="rs-members-group-title">{group.title}</h3>
                        {group.members.map((member) => {
                            const displayName = displayNameOf(member);
                            const sources = memberAvatarSources(client, member, 72, "crop");
                            const role = topRole(member.userId);
                            const roleLabel = role?.name ?? getRoleLabel(getUserPowerLevel(roleSourceRoom, member.userId));
                            const presence = presenceByUserId.get(member.userId);

                            return (
                                <div
                                    className={`rs-member-row${group.offline ? " is-offline" : ""}`}
                                    key={member.userId}
                                    data-user-id={member.userId}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        openMenu(member.userId, event.clientX, event.clientY);
                                    }}
                                >
                                    <button type="button" className="rs-member-select" onClick={() => onSelectUser(member.userId)} title={member.userId}>
                                        <Avatar
                                            className="rs-member-avatar"
                                            name={displayName}
                                            src={sources[0] ?? null}
                                            sources={sources}
                                            seed={member.userId}
                                            userId={member.userId}
                                            presenceState={presenceEnabled ? toAvatarPresenceState(presence) : null}
                                        />
                                        <span className="rs-member-meta">
                                            <span className="rs-member-name-line">
                                                <span className="rs-member-name" style={role ? { color: role.color } : undefined}>
                                                    {displayName}
                                                </span>
                                                <UserBadges client={client} userId={member.userId} />
                                            </span>
                                            {/* Like Discord: their status (or what they're playing) under the name, else the user ID. */}
                                            <span className={`rs-member-id${presence?.statusText ? " is-status" : ""}`} title={member.userId}>
                                                {presence?.statusText ?? member.userId}
                                            </span>
                                        </span>
                                        <span className="rs-member-badge">{roleLabel}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="rs-member-more"
                                        aria-label={`More for ${displayName}`}
                                        onClick={(event) => {
                                            const box = event.currentTarget.getBoundingClientRect();
                                            openMenu(member.userId, box.left, box.bottom);
                                        }}
                                    >
                                        ⋯
                                    </button>
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
                {orderedMembers.length === 0 ? <div className="rs-empty-state">No members found.</div> : null}
            </div>
            {menu ? (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={menuItems(menu.userId)}
                    label={`${displayNameOf(room.getMember(menu.userId) ?? ({ userId: menu.userId } as RoomMember))} member menu`}
                    onClose={() => setMenu(null)}
                />
            ) : null}
        </div>
    );
}
