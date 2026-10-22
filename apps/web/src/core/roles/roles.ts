// SPDX-License-Identifier: AGPL-3.0-only
// Discord-style roles on top of Matrix power levels.
//
// Matrix gives each person one power level per room, and each action a minimum level. Roles map onto that:
// - every role has a rank (1-99, its power level); a member's level is their highest role's rank;
// - a permission's minimum level is the lowest rank of any role that has it, so higher roles inherit the
//   permissions of lower ones (the usual Discord setup: Admin > Moderator > Member);
// - "who can view" a channel makes it invite-only for the allowed roles (the space admin's app invites people
//   who gain a role and removes people who lose it).
// Everything is stored as state in the space (and channels), so the server enforces it and Element users are
// bound by the same levels.

export const ROLES_EVENT = "io.github.peytong.meadhall.roles"; // space, state_key ""
export const MEMBER_ROLES_EVENT = "io.github.peytong.meadhall.member_roles"; // space, state_key = memberRolesKey(user)

// State keys starting with "@" can only be set by that user, so assignments are keyed "user:@alice:example.org".
export function memberRolesKey(userId: string): string {
    return `user:${userId}`;
}

export function userIdFromMemberRolesKey(stateKey: string): string | null {
    return stateKey.startsWith("user:@") ? stateKey.slice("user:".length) : null;
}
export const CHANNEL_VIEW_EVENT = "io.github.peytong.meadhall.channel_view"; // channel, state_key ""

export type Permission =
    | "manage_server"
    | "manage_channels"
    | "manage_roles"
    | "kick"
    | "ban"
    | "invite"
    | "manage_messages"
    | "pin_messages"
    | "mention_everyone";

export const PERMISSIONS: ReadonlyArray<{ id: Permission; label: string; description: string }> = [
    { id: "manage_server", label: "Manage server", description: "Change the server's name, icon and topic" },
    { id: "manage_channels", label: "Manage channels", description: "Create, rename and remove channels" },
    { id: "manage_roles", label: "Manage roles", description: "Create roles and give them to people" },
    { id: "kick", label: "Kick members", description: "Remove people (they can rejoin)" },
    { id: "ban", label: "Ban members", description: "Remove people and stop them coming back" },
    { id: "invite", label: "Invite people", description: "Invite people to the server and its channels" },
    { id: "manage_messages", label: "Manage messages", description: "Delete other people's messages" },
    { id: "pin_messages", label: "Pin messages", description: "Pin and unpin messages" },
    { id: "mention_everyone", label: "Mention @everyone", description: "Notify the whole room" },
];

export interface Role {
    id: string;
    name: string;
    color: string;
    // Power level, 1-99. Higher ranks are listed first and inherit lower ranks' permissions.
    rank: number;
    permissions: Permission[];
}

const MAX_RANK = 99;

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseRoles(content: unknown): Role[] {
    if (!isObject(content) || !Array.isArray(content.roles)) {
        return [];
    }
    const valid = new Set(PERMISSIONS.map((permission) => permission.id));
    return content.roles
        .filter(isObject)
        .map((role) => ({
            id: typeof role.id === "string" ? role.id : "",
            name: typeof role.name === "string" ? role.name.slice(0, 64) : "Role",
            color: typeof role.color === "string" && /^#[0-9a-f]{6}$/i.test(role.color) ? role.color.toLowerCase() : "#99aab5",
            rank: typeof role.rank === "number" ? Math.min(MAX_RANK, Math.max(1, Math.round(role.rank))) : 1,
            permissions: Array.isArray(role.permissions)
                ? role.permissions.filter((permission): permission is Permission => valid.has(permission as Permission))
                : [],
        }))
        .filter((role) => role.id.length > 0)
        .sort((left, right) => right.rank - left.rank);
}

export function parseMemberRoles(content: unknown, roles: Role[]): string[] {
    if (!isObject(content) || !Array.isArray(content.roles)) {
        return [];
    }
    const known = new Set(roles.map((role) => role.id));
    return content.roles.filter((id): id is string => typeof id === "string" && known.has(id));
}

export function parseChannelView(content: unknown, roles: Role[]): string[] | null {
    if (!isObject(content) || !Array.isArray(content.roles)) {
        return null; // everyone
    }
    const known = new Set(roles.map((role) => role.id));
    return content.roles.filter((id): id is string => typeof id === "string" && known.has(id));
}

export function memberRank(roleIds: string[], roles: Role[]): number {
    return roles.filter((role) => roleIds.includes(role.id)).reduce((highest, role) => Math.max(highest, role.rank), 0);
}

export function newRoleId(): string {
    return `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Where each permission lives in m.room.power_levels.
const SPACE_PERMISSION_KEYS: Record<Permission, string[]> = {
    manage_server: ["events.m.room.name", "events.m.room.avatar", "events.m.room.topic"],
    manage_channels: ["events.m.space.child"],
    manage_roles: [`events.m.room.power_levels`, `events.${ROLES_EVENT}`, `events.${MEMBER_ROLES_EVENT}`],
    kick: ["kick"],
    ban: ["ban"],
    invite: ["invite"],
    manage_messages: ["redact"],
    pin_messages: ["events.m.room.pinned_events"],
    mention_everyone: ["notifications.room"],
};

const CHANNEL_PERMISSION_KEYS: Record<Permission, string[]> = {
    manage_server: [],
    manage_channels: ["events.m.room.name", "events.m.room.avatar", "events.m.room.topic", `events.${CHANNEL_VIEW_EVENT}`],
    manage_roles: ["events.m.room.power_levels"],
    kick: ["kick"],
    ban: ["ban"],
    invite: ["invite"],
    manage_messages: ["redact"],
    pin_messages: ["events.m.room.pinned_events"],
    mention_everyone: ["notifications.room"],
};

type PowerLevels = Record<string, unknown>;

function setKey(content: PowerLevels, key: string, value: number): void {
    if (key.startsWith("events.")) {
        const events = isObject(content.events) ? { ...content.events } : {};
        events[key.slice("events.".length)] = value;
        content.events = events;
    } else if (key.startsWith("notifications.")) {
        const notifications = isObject(content.notifications) ? { ...content.notifications } : {};
        notifications[key.slice("notifications.".length)] = value;
        content.notifications = notifications;
    } else {
        content[key] = value;
    }
}

export interface ApplyInput {
    current: PowerLevels;
    roles: Role[];
    // Members of the room and the role IDs they hold.
    assignments: Map<string, string[]>;
    // Your own level in this room: nobody at or above it is changed, and no threshold is set above it.
    ownLevel: number;
    // Users never changed (e.g. room creators in room version 12, who have unlimited power).
    protectedUsers?: ReadonlySet<string>;
    scope: "space" | "channel";
}

// The power levels a room should have for the roles. Untouched: anyone at 100+, anyone at or above you, and
// permissions no role grants (they keep the room's existing minimums).
export function applyRolesToPowerLevels({ current, roles, assignments, ownLevel, protectedUsers, scope }: ApplyInput): PowerLevels {
    const next: PowerLevels = { ...current };
    const users = isObject(current.users) ? { ...(current.users as Record<string, number>) } : {};
    const ceiling = Math.min(MAX_RANK, ownLevel - 1);

    for (const [userId, roleIds] of assignments) {
        const existing = typeof users[userId] === "number" ? users[userId] : 0;
        if (protectedUsers?.has(userId) || existing >= 100 || existing >= ownLevel) {
            continue;
        }
        const rank = Math.min(ceiling, memberRank(roleIds, roles));
        if (rank > 0) {
            users[userId] = rank;
        } else {
            delete users[userId];
        }
    }
    next.users = users;

    const keys = scope === "space" ? SPACE_PERMISSION_KEYS : CHANNEL_PERMISSION_KEYS;
    for (const permission of PERMISSIONS) {
        const granting = roles.filter((role) => role.permissions.includes(permission.id));
        if (granting.length === 0) {
            continue;
        }
        const minimum = Math.min(ceiling, Math.min(...granting.map((role) => role.rank)));
        for (const key of keys[permission.id]) {
            setKey(next, key, minimum);
        }
    }
    return next;
}

// Who may be in a channel limited to some roles (null = everyone in the server).
export function allowedViewers(viewRoles: string[] | null, assignments: Map<string, string[]>): Set<string> | null {
    if (viewRoles === null) {
        return null;
    }
    const allowed = new Set<string>();
    for (const [userId, roleIds] of assignments) {
        if (roleIds.some((roleId) => viewRoles.includes(roleId))) {
            allowed.add(userId);
        }
    }
    return allowed;
}
