// SPDX-License-Identifier: AGPL-3.0-only
// Saves roles and applies them to the space and its channels (power levels, and invite-only channels limited to
// some roles). Runs in the app of whoever edits the roles; they need the right to change power levels.
import { EventType, JoinRule, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import {
    allowedViewers,
    applyRolesToPowerLevels,
    CHANNEL_VIEW_EVENT,
    MEMBER_ROLES_EVENT,
    memberRolesKey,
    parseChannelView,
    parseMemberRoles,
    parseRoles,
    ROLES_EVENT,
    userIdFromMemberRolesKey,
    type Role,
} from "./roles";

export function readRoles(space: Room): Role[] {
    return parseRoles(space.currentState.getStateEvents(ROLES_EVENT, "")?.getContent());
}

// Role IDs per user, for everyone who has ever been given roles through Meadhall. People without an entry keep
// whatever level they have (e.g. moderators made in another client) until they're given roles here.
export function readAssignments(space: Room, roles: Role[] = readRoles(space)): Map<string, string[]> {
    const assignments = new Map<string, string[]>();
    for (const event of space.currentState.getStateEvents(MEMBER_ROLES_EVENT)) {
        const userId = userIdFromMemberRolesKey(event.getStateKey() ?? "");
        if (userId) {
            assignments.set(userId, parseMemberRoles(event.getContent(), roles));
        }
    }
    return assignments;
}

export function readChannelView(channel: Room, roles: Role[]): string[] | null {
    return parseChannelView(channel.currentState.getStateEvents(CHANNEL_VIEW_EVENT, "")?.getContent(), roles);
}

function ownLevel(client: MatrixClient, room: Room): number {
    const level = room.getMember(client.getSafeUserId())?.powerLevel ?? 0;
    return Number.isFinite(level) ? level : 1000;
}

function untouchable(room: Room): Set<string> {
    // Admins (100+) and room-version-12 creators (unlimited power) are never changed by roles.
    return new Set(
        room
            .getJoinedMembers()
            .filter((member) => !Number.isFinite(member.powerLevel) || member.powerLevel >= 100)
            .map((member) => member.userId),
    );
}

async function applyPowerLevels(client: MatrixClient, room: Room, roles: Role[], assignments: Map<string, string[]>, scope: "space" | "channel"): Promise<void> {
    if (!room.currentState.maySendStateEvent(EventType.RoomPowerLevels, client.getSafeUserId())) {
        return;
    }
    const current = (room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ?? {}) as Record<string, unknown>;
    const next = applyRolesToPowerLevels({
        current,
        roles,
        assignments,
        ownLevel: ownLevel(client, room),
        protectedUsers: untouchable(room),
        scope,
    });
    if (JSON.stringify(next) !== JSON.stringify(current)) {
        // Wait for the echo, so the next change starts from these levels rather than stale ones.
        await sendAndWait(client, room, EventType.RoomPowerLevels, next, "");
    }
}

// Channels limited to some roles are invite-only: invite space members who may view it, remove those who may not.
async function applyChannelAccess(client: MatrixClient, space: Room, channel: Room, roles: Role[], assignments: Map<string, string[]>): Promise<void> {
    const viewRoles = readChannelView(channel, roles);
    const allowed = allowedViewers(viewRoles, assignments);
    if (allowed === null) {
        return;
    }
    const me = client.getSafeUserId();
    const protectedUsers = untouchable(channel);
    const joinRule = channel.currentState.getStateEvents(EventType.RoomJoinRules, "")?.getContent()?.join_rule;
    if (joinRule !== JoinRule.Invite && channel.currentState.maySendStateEvent(EventType.RoomJoinRules, me)) {
        await client.sendStateEvent(channel.roomId, EventType.RoomJoinRules, { join_rule: JoinRule.Invite } as never, "");
    }
    for (const member of space.getJoinedMembers()) {
        const inChannel = channel.getMember(member.userId)?.membership;
        if (allowed.has(member.userId) && inChannel !== "join" && inChannel !== "invite" && channel.canInvite(me)) {
            await client.invite(channel.roomId, member.userId).catch(() => undefined);
        }
    }
    for (const member of channel.getMembers()) {
        const stillAllowed = allowed.has(member.userId) || protectedUsers.has(member.userId) || member.userId === me;
        if (!stillAllowed && (member.membership === "join" || member.membership === "invite")) {
            await client.kick(channel.roomId, member.userId, "No longer has a role that can see this channel").catch(() => undefined);
        }
    }
}

// Re-applies everything after a change to roles, someone's roles, or a channel's viewers.
export async function syncRoles(client: MatrixClient, space: Room, channels: Room[]): Promise<void> {
    const roles = readRoles(space);
    const assignments = readAssignments(space, roles);
    await applyPowerLevels(client, space, roles, assignments, "space");
    for (const channel of channels) {
        await applyPowerLevels(client, channel, roles, assignments, "channel");
        await applyChannelAccess(client, space, channel, roles, assignments);
    }
}

// Waits until our own copy of the room shows a state event we just sent, so syncRoles reads fresh state.
async function sendAndWait(client: MatrixClient, room: Room, type: string, content: Record<string, unknown>, stateKey: string): Promise<void> {
    const { event_id: eventId } = await client.sendStateEvent(room.roomId, type as never, content as never, stateKey);
    const deadline = Date.now() + 10_000;
    while (room.currentState.getStateEvents(type, stateKey)?.getId() !== eventId && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

export async function saveRoles(client: MatrixClient, space: Room, channels: Room[], roles: Role[]): Promise<void> {
    await sendAndWait(client, space, ROLES_EVENT, { roles }, "");
    await syncRoles(client, space, channels);
}

export async function setMemberRoles(client: MatrixClient, space: Room, channels: Room[], userId: string, roleIds: string[]): Promise<void> {
    await sendAndWait(client, space, MEMBER_ROLES_EVENT, { roles: roleIds }, memberRolesKey(userId));
    await syncRoles(client, space, channels);
}

export async function setChannelViewRoles(client: MatrixClient, space: Room, channel: Room, roleIds: string[] | null): Promise<void> {
    await sendAndWait(client, channel, CHANNEL_VIEW_EVENT, roleIds === null ? {} : { roles: roleIds }, "");
    await syncRoles(client, space, [channel]);
}

// The color of someone's highest role in a space (for names in member lists), if they have one.
export function memberRoleColor(space: Room | null, userId: string): string | null {
    if (!space) {
        return null;
    }
    const roles = readRoles(space);
    const mine = readAssignments(space, roles).get(userId) ?? [];
    return roles.find((role) => mine.includes(role.id))?.color ?? null;
}
