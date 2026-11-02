// SPDX-License-Identifier: AGPL-3.0-only
// Giving people roles from the bot, the same way Meadhall does it in an admin's app (apps/web/src/core/roles):
// the role assignment is saved in the space, then each room's power levels are recomputed with the same pure
// function, and channels limited to some roles invite the people who may now see them.
import type { MatrixClient, Room } from "matrix-js-sdk";

import {
    CHANNEL_VIEW_EVENT,
    MEMBER_ROLES_EVENT,
    ROLES_EVENT,
    allowedViewers,
    applyRolesToPowerLevels,
    memberRolesKey,
    parseChannelView,
    parseMemberRoles,
    parseRoles,
    userIdFromMemberRolesKey,
    type Role,
} from "../../web/src/core/roles/roles.ts";

export function readRoles(space: Room): Role[] {
    return parseRoles(space.currentState.getStateEvents(ROLES_EVENT, "")?.getContent());
}

export function readAssignments(space: Room, roles: Role[]): Map<string, string[]> {
    const assignments = new Map<string, string[]>();
    for (const event of space.currentState.getStateEvents(MEMBER_ROLES_EVENT)) {
        const userId = userIdFromMemberRolesKey(event.getStateKey() ?? "");
        if (userId) assignments.set(userId, parseMemberRoles(event.getContent(), roles));
    }
    return assignments;
}

// The server's channels: rooms listed as its children that the bot is in.
export function spaceChannels(client: MatrixClient, space: Room): Room[] {
    return space.currentState
        .getStateEvents("m.space.child")
        .filter((event) => Array.isArray(event.getContent().via) && event.getContent().via.length > 0)
        .map((event) => client.getRoom(event.getStateKey() ?? ""))
        .filter((room): room is Room => room !== null && room.getMyMembership() === "join");
}

export function powerLevel(room: Room, userId: string): number {
    const level = room.getMember(userId)?.powerLevel ?? 0;
    return Number.isFinite(level) ? level : 1000;
}

async function applyLevels(client: MatrixClient, room: Room, roles: Role[], assignments: Map<string, string[]>, scope: "space" | "channel"): Promise<void> {
    const me = client.getSafeUserId();
    if (!room.currentState.maySendStateEvent("m.room.power_levels", me)) return;
    const current = (room.currentState.getStateEvents("m.room.power_levels", "")?.getContent() ?? {}) as Record<string, unknown>;
    const protectedUsers = new Set(
        room
            .getJoinedMembers()
            .filter((member) => !Number.isFinite(member.powerLevel) || member.powerLevel >= 100)
            .map((member) => member.userId),
    );
    // Who may talk is the admin's choice (Server Settings); the bot only changes people's levels.
    const next = applyRolesToPowerLevels({ current, roles, assignments, ownLevel: powerLevel(room, me), protectedUsers, scope });
    if (JSON.stringify(next) !== JSON.stringify(current)) {
        await client.sendStateEvent(room.roomId, "m.room.power_levels" as never, next as never, "");
    }
}

// Adds roles to someone (keeping the ones they have). Returns whether anything changed.
export async function grantRoles(client: MatrixClient, space: Room, userId: string, roleIds: string[]): Promise<boolean> {
    const roles = readRoles(space);
    const known = roleIds.filter((id) => roles.some((role) => role.id === id));
    const assignments = readAssignments(space, roles);
    const current = assignments.get(userId) ?? [];
    const next = [...new Set([...current, ...known])];
    if (next.length === current.length) return false;
    // Never give a role ranked at or above the bot's own level: the homeserver would refuse the levels anyway.
    const ownLevel = powerLevel(space, client.getSafeUserId());
    if (roles.some((role) => next.includes(role.id) && !current.includes(role.id) && role.rank >= ownLevel)) {
        throw new Error("A role to give is ranked at or above the bot's own role.");
    }
    await client.sendStateEvent(space.roomId, MEMBER_ROLES_EVENT as never, { roles: next } as never, memberRolesKey(userId));
    assignments.set(userId, next);
    await applyLevels(client, space, roles, assignments, "space");
    for (const channel of spaceChannels(client, space)) {
        await applyLevels(client, channel, roles, assignments, "channel");
        // Channels limited to some roles: invite them if a new role lets them in.
        const viewers = allowedViewers(parseChannelView(channel.currentState.getStateEvents(CHANNEL_VIEW_EVENT, "")?.getContent(), roles), assignments);
        const membership = channel.getMember(userId)?.membership;
        if (viewers?.has(userId) && membership !== "join" && membership !== "invite" && channel.canInvite(client.getSafeUserId())) {
            await client.invite(channel.roomId, userId).catch(() => undefined);
        }
    }
    return true;
}

// A timeout: in every channel, someone's level goes below what talking needs, until it ends.
export async function setTimedOut(client: MatrixClient, space: Room, userId: string, timedOut: boolean): Promise<void> {
    const roles = readRoles(space);
    const assignments = readAssignments(space, roles);
    for (const channel of spaceChannels(client, space)) {
        if (!channel.currentState.maySendStateEvent("m.room.power_levels", client.getSafeUserId())) continue;
        const current = (channel.currentState.getStateEvents("m.room.power_levels", "")?.getContent() ?? {}) as Record<string, unknown>;
        const users = { ...((current.users as Record<string, number> | undefined) ?? {}) };
        if (timedOut) {
            const eventsDefault = typeof current.events_default === "number" ? current.events_default : 0;
            users[userId] = Math.min(eventsDefault, 0) - 1;
            await client.sendStateEvent(channel.roomId, "m.room.power_levels" as never, { ...current, users } as never, "");
        } else {
            // Back to what their roles give (in one change, so nothing reads the timed-out levels in between).
            delete users[userId];
            const me = client.getSafeUserId();
            const protectedUsers = new Set(channel.getJoinedMembers().filter((member) => member.powerLevel >= 100).map((member) => member.userId));
            const next = applyRolesToPowerLevels({ current: { ...current, users }, roles, assignments, ownLevel: powerLevel(channel, me), protectedUsers, scope: "channel" });
            await client.sendStateEvent(channel.roomId, "m.room.power_levels" as never, next as never, "");
        }
    }
}
