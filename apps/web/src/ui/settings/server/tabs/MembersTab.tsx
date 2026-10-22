// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings -> Members: the member browser with Discord-style roles. Admins create roles (name, color,
// rank, permissions), give them to members, and choose which roles can see each channel. Roles are applied as
// Matrix power levels and invite-only channels (core/roles), so the server enforces them for everyone.
import React, { useEffect, useMemo, useState } from "react";
import { EventType, RoomStateEvent, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { readAssignments, readChannelView, readRoles, saveRoles, setChannelViewRoles, setMemberRoles } from "../../../../core/roles/applyRoles";
import { MEMBER_ROLES_EVENT, newRoleId, PERMISSIONS, ROLES_EVENT, type Permission, type Role } from "../../../../core/roles/roles";
import { memberAvatarSources } from "../../../adapters/avatar";
import { Avatar } from "../../../components/Avatar";
import { getUserPowerLevel } from "../../../components/rooms/roomAdminUtils";
import { matchesUserSearch } from "../../../search/userSearch";

interface MembersTabProps {
    client: MatrixClient;
    spaceRoom: Room;
    channels: Room[];
    onToast: (toast: { type: "success" | "error" | "info"; message: string }) => void;
}

const ROLE_COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#99aab5"];

function errorText(error: unknown): string {
    const data = (error as { data?: { error?: unknown } }).data;
    return typeof data?.error === "string" ? data.error : error instanceof Error ? error.message : String(error);
}

// Re-renders when roles or assignments change in the space (ours or another admin's).
function useSpaceStateVersion(rooms: Room[]): number {
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const bump = (): void => setVersion((value) => value + 1);
        for (const room of rooms) room.currentState.on(RoomStateEvent.Events, bump);
        return () => {
            for (const room of rooms) room.currentState.removeListener(RoomStateEvent.Events, bump);
        };
    }, [rooms]);
    return version;
}

function RoleEditor({ role, onChange, onDelete, disabled }: { role: Role; onChange: (role: Role) => void; onDelete: () => void; disabled: boolean }): React.ReactElement {
    const toggle = (permission: Permission): void =>
        onChange({
            ...role,
            permissions: role.permissions.includes(permission)
                ? role.permissions.filter((candidate) => candidate !== permission)
                : [...role.permissions, permission],
        });
    return (
        <details className="roles-editor" data-role-id={role.id}>
            <summary>
                <span className="roles-dot" style={{ background: role.color }} />
                <span className="roles-name" style={{ color: role.color }}>{role.name}</span>
                <span className="roles-rank">Rank {role.rank}</span>
            </summary>
            <div className="roles-editor-body">
                <label className="settings-field">
                    Name
                    <input type="text" value={role.name} disabled={disabled} maxLength={64} onChange={(event) => onChange({ ...role, name: event.target.value })} />
                </label>
                <label className="settings-field">
                    Rank (1-99; higher roles can do everything lower roles can)
                    <input type="number" min={1} max={99} value={role.rank} disabled={disabled} onChange={(event) => onChange({ ...role, rank: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} />
                </label>
                <div className="roles-colors" role="radiogroup" aria-label="Role color">
                    {ROLE_COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            role="radio"
                            aria-checked={role.color === color}
                            aria-label={`Color ${color}`}
                            className={`roles-color${role.color === color ? " is-active" : ""}`}
                            style={{ background: color }}
                            disabled={disabled}
                            onClick={() => onChange({ ...role, color })}
                        />
                    ))}
                </div>
                <div className="roles-permissions">
                    {PERMISSIONS.map((permission) => (
                        <label key={permission.id} className="settings-toggle" title={permission.description}>
                            <input type="checkbox" checked={role.permissions.includes(permission.id)} disabled={disabled} onChange={() => toggle(permission.id)} />
                            {permission.label}
                        </label>
                    ))}
                </div>
                <button type="button" className="settings-button settings-button-danger" disabled={disabled} onClick={onDelete}>
                    Delete role
                </button>
            </div>
        </details>
    );
}

export function MembersTab({ client, spaceRoom, channels, onToast }: MembersTabProps): React.ReactElement {
    const version = useSpaceStateVersion(useMemo(() => [spaceRoom, ...channels], [channels, spaceRoom]));
    const roles = useMemo(() => readRoles(spaceRoom), [spaceRoom, version]);
    const assignments = useMemo(() => readAssignments(spaceRoom, roles), [roles, spaceRoom, version]);
    const [draftRoles, setDraftRoles] = useState<Role[]>(roles);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState("");
    useEffect(() => setDraftRoles(roles), [roles]);

    const me = client.getSafeUserId();
    const canManage =
        spaceRoom.currentState.maySendStateEvent(ROLES_EVENT, me) &&
        spaceRoom.currentState.maySendStateEvent(MEMBER_ROLES_EVENT, me) &&
        spaceRoom.currentState.maySendStateEvent(EventType.RoomPowerLevels, me);
    const rolesChanged = JSON.stringify(draftRoles) !== JSON.stringify(roles);

    const run = async (action: () => Promise<void>, done: string): Promise<void> => {
        setBusy(true);
        try {
            await action();
            onToast({ type: "success", message: done });
        } catch (error) {
            onToast({ type: "error", message: errorText(error) });
        } finally {
            setBusy(false);
        }
    };

    const members = useMemo(
        () =>
            spaceRoom
                .getMembers()
                .filter((member) => member.membership === "join" || member.membership === "invite")
                .map((member) => ({
                    userId: member.userId,
                    displayName: member.rawDisplayName || member.name || member.userId,
                    avatarSources: memberAvatarSources(client, member, 72, "crop"),
                    powerLevel: getUserPowerLevel(spaceRoom, member.userId),
                }))
                .filter((member) => matchesUserSearch(search, member.userId, member.displayName))
                .sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" })),
        [client, search, spaceRoom, version],
    );

    return (
        <div className="settings-tab">
            <h2 className="settings-tab-title">Members & roles</h2>
            <p className="settings-tab-description">
                Roles give people permissions and decide who sees private channels. They work as Matrix power levels, so
                they apply in every app, Element included.
            </p>

            <div className="settings-section-card" data-testid="roles-section">
                <h3>Roles</h3>
                {draftRoles.length === 0 ? <p className="settings-tab-description">No roles yet.</p> : null}
                {draftRoles.map((role) => (
                    <RoleEditor
                        key={role.id}
                        role={role}
                        disabled={!canManage || busy}
                        onChange={(next) => setDraftRoles((current) => current.map((candidate) => (candidate.id === role.id ? next : candidate)))}
                        onDelete={() => setDraftRoles((current) => current.filter((candidate) => candidate.id !== role.id))}
                    />
                ))}
                {canManage ? (
                    <div className="settings-actions-row">
                        <button
                            type="button"
                            className="settings-button settings-button-secondary"
                            disabled={busy}
                            onClick={() =>
                                setDraftRoles((current) => [
                                    ...current,
                                    { id: newRoleId(), name: "New role", color: ROLE_COLORS[current.length % ROLE_COLORS.length], rank: 10, permissions: [] },
                                ])
                            }
                        >
                            Create role
                        </button>
                        <button
                            type="button"
                            className="settings-button"
                            disabled={busy || !rolesChanged}
                            onClick={() => void run(() => saveRoles(client, spaceRoom, channels, draftRoles), "Roles saved.")}
                        >
                            {busy ? "Saving..." : "Save roles"}
                        </button>
                    </div>
                ) : (
                    <p className="settings-tab-description">You need permission to manage roles to change these.</p>
                )}
            </div>

            <div className="settings-section-card" data-testid="members-section">
                <h3>Members</h3>
                <label className="settings-field">
                    Search members
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or username" />
                </label>
                <div className="settings-members-list">
                    {members.map((member) => {
                        const held = assignments.get(member.userId) ?? [];
                        const available = roles.filter((role) => !held.includes(role.id));
                        return (
                            <div className="settings-members-row" key={member.userId} data-user-id={member.userId}>
                                <Avatar
                                    className="settings-members-avatar"
                                    name={member.displayName}
                                    src={member.avatarSources[0] ?? null}
                                    sources={member.avatarSources}
                                    seed={member.userId}
                                    userId={member.userId}
                                />
                                <div className="settings-members-main">
                                    <span className="settings-members-name">{member.displayName}</span>
                                    <span className="settings-members-id">
                                        {member.userId}
                                        {member.powerLevel >= 100 ? " · Admin" : ""}
                                    </span>
                                </div>
                                <div className="roles-chips">
                                    {roles
                                        .filter((role) => held.includes(role.id))
                                        .map((role) => (
                                            <span key={role.id} className="roles-chip" style={{ borderColor: role.color }}>
                                                <span className="roles-dot" style={{ background: role.color }} />
                                                {role.name}
                                                {canManage ? (
                                                    <button
                                                        type="button"
                                                        aria-label={`Remove ${role.name} from ${member.displayName}`}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void run(
                                                                () => setMemberRoles(client, spaceRoom, channels, member.userId, held.filter((id) => id !== role.id)),
                                                                `${role.name} removed.`,
                                                            )
                                                        }
                                                    >
                                                        ×
                                                    </button>
                                                ) : null}
                                            </span>
                                        ))}
                                    {canManage && available.length > 0 ? (
                                        <select
                                            className="roles-add"
                                            aria-label={`Give ${member.displayName} a role`}
                                            value=""
                                            disabled={busy}
                                            onChange={(event) => {
                                                const roleId = event.target.value;
                                                if (!roleId) return;
                                                const role = roles.find((candidate) => candidate.id === roleId);
                                                void run(() => setMemberRoles(client, spaceRoom, channels, member.userId, [...held, roleId]), `${role?.name ?? "Role"} given.`);
                                            }}
                                        >
                                            <option value="">+ Role</option>
                                            {available.map((role) => (
                                                <option key={role.id} value={role.id}>
                                                    {role.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                    {members.length === 0 ? <div className="settings-empty">No members found.</div> : null}
                </div>
            </div>

            {roles.length > 0 ? (
                <div className="settings-section-card" data-testid="channel-access-section">
                    <h3>Channel access</h3>
                    <p className="settings-tab-description">Pick roles to make a channel private to them. No roles = everyone.</p>
                    {channels.map((channel) => {
                        const view = readChannelView(channel, roles);
                        return (
                            <div key={channel.roomId} className="roles-channel-row" data-channel-id={channel.roomId}>
                                <span className="roles-channel-name">#{channel.name}</span>
                                <span className="roles-channel-roles">
                                    {roles.map((role) => {
                                        const checked = view?.includes(role.id) ?? false;
                                        return (
                                            <label key={role.id} className="roles-channel-role">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={!canManage || busy}
                                                    onChange={() => {
                                                        const current = view ?? [];
                                                        const next = checked ? current.filter((id) => id !== role.id) : [...current, role.id];
                                                        void run(
                                                            () => setChannelViewRoles(client, spaceRoom, channel, next.length > 0 ? next : null),
                                                            next.length > 0 ? `#${channel.name} is now private.` : `#${channel.name} is open to everyone.`,
                                                        );
                                                    }}
                                                />
                                                <span style={{ color: role.color }}>{role.name}</span>
                                            </label>
                                        );
                                    })}
                                    {view === null ? <span className="roles-channel-everyone">Everyone</span> : null}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
