// SPDX-License-Identifier: AGPL-3.0-only
// Reading and changing a server's bots, onboarding and auto-mod (formats in botProtocol.ts). Admin actions run in
// the admin's app; the bot itself (apps/bot) does what has to happen without anyone online: granting onboarding
// roles, welcome messages, auto-mod and answering commands.
import { EventType, RoomStateEvent, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { useEffect, useState } from "react";

import { readAssignments, readRoles, setChannelTalkRole, syncRoles } from "../roles/applyRoles";
import { MEMBER_ROLES_EVENT, memberRolesKey } from "../roles/roles";
import {
    AUTOMOD_EVENT,
    BOTS_EVENT,
    COMMANDS_EVENT,
    ONBOARDING_EVENT,
    ONBOARDING_RESPONSE_EVENT,
    automodContent,
    botsContent,
    onboardingContent,
    onboardingResponseContent,
    parseAutomod,
    parseBots,
    parseCommands,
    parseOnboarding,
    parseOnboardingResponse,
    type AutomodConfig,
    type BotCommand,
    type BotEntry,
    type OnboardingConfig,
    type OnboardingResponse,
} from "./botProtocol";

const state = (space: Room, type: string, key = ""): MatrixEvent | null => space.currentState.getStateEvents(type, key) ?? null;

export function readBots(space: Room | null): BotEntry[] {
    return space ? parseBots(state(space, BOTS_EVENT)?.getContent()) : [];
}

export function isServerBot(space: Room | null, userId: string): boolean {
    return readBots(space).some((bot) => bot.userId === userId);
}

// Commands of the server's bots that are still in the server. A command list counts only if the bot sent it
// itself (the homeserver already requires that for "@" state keys; checked again here).
export function readServerCommands(space: Room | null): BotCommand[] {
    if (!space) return [];
    return readBots(space).flatMap((bot) => {
        if (space.getMember(bot.userId)?.membership !== "join") return [];
        const event = state(space, COMMANDS_EVENT, bot.userId);
        return event && event.getSender() === bot.userId ? parseCommands(bot.userId, event.getContent()) : [];
    });
}

export function readOnboarding(space: Room | null): OnboardingConfig {
    return parseOnboarding(space ? state(space, ONBOARDING_EVENT)?.getContent() : null);
}

export function readAutomod(space: Room | null): AutomodConfig {
    return parseAutomod(space ? state(space, AUTOMOD_EVENT)?.getContent() : null);
}

export function readOnboardingResponse(space: Room, userId: string): OnboardingResponse | null {
    const event = state(space, ONBOARDING_RESPONSE_EVENT, userId);
    if (!event || event.getSender() !== userId) return null;
    return parseOnboardingResponse(event.getContent(), readOnboarding(space));
}

// Whether you still have to go through the server's onboarding (it's on, you're not an admin or a bot, and you
// haven't answered, or the questions changed so your answers no longer complete it).
export function needsOnboarding(client: MatrixClient, space: Room | null): boolean {
    const userId = client.getUserId();
    if (!space || !userId) return false;
    const config = readOnboarding(space);
    if (!config.enabled) return false;
    if ((space.getMember(userId)?.powerLevel ?? 0) >= 50 || isServerBot(space, userId)) return false;
    return readOnboardingResponse(space, userId) === null;
}

// Re-renders when any of these state types change in the space.
export function useSpaceState(space: Room | null, types: readonly string[]): number {
    const [revision, setRevision] = useState(0);
    const key = types.join("|");
    useEffect(() => {
        if (!space) return undefined;
        const wanted = new Set(key.split("|"));
        const onEvent = (event: MatrixEvent): void => {
            if (wanted.has(event.getType()) || event.getType() === EventType.RoomMember || event.getType() === EventType.RoomPowerLevels) {
                setRevision((value) => value + 1);
            }
        };
        space.currentState.on(RoomStateEvent.Events, onEvent);
        return () => {
            space.currentState.removeListener(RoomStateEvent.Events, onEvent);
        };
    }, [space, key]);
    return revision;
}

export const BOT_STATE_TYPES = [BOTS_EVENT, COMMANDS_EVENT, ONBOARDING_EVENT, ONBOARDING_RESPONSE_EVENT, AUTOMOD_EVENT, MEMBER_ROLES_EVENT] as const;

// Lets members send the state keyed by their own ID that bots and onboarding use: a bot's command list and a
// member's onboarding answers (the homeserver still only lets each user write their own key).
async function allowOwnState(client: MatrixClient, space: Room): Promise<void> {
    if (!space.currentState.maySendStateEvent(EventType.RoomPowerLevels, client.getSafeUserId())) return;
    const current = (state(space, EventType.RoomPowerLevels)?.getContent() ?? {}) as Record<string, unknown>;
    const events = { ...((current.events as Record<string, number> | undefined) ?? {}) };
    if (events[COMMANDS_EVENT] === 0 && events[ONBOARDING_RESPONSE_EVENT] === 0) return;
    events[COMMANDS_EVENT] = 0;
    events[ONBOARDING_RESPONSE_EVENT] = 0;
    await client.sendStateEvent(space.roomId, EventType.RoomPowerLevels, { ...current, events } as never, "");
}

export async function addBot(client: MatrixClient, space: Room, channels: Room[], botId: string, roleIds: string[]): Promise<void> {
    const bots = readBots(space).filter((bot) => bot.userId !== botId);
    await client.sendStateEvent(space.roomId, BOTS_EVENT as never, botsContent([...bots, { userId: botId, addedBy: client.getSafeUserId(), addedAt: Date.now() }]) as never, "");
    await allowOwnState(client, space);
    const membership = space.getMember(botId)?.membership;
    if (membership !== "join" && membership !== "invite") await client.invite(space.roomId, botId);
    for (const channel of channels) {
        const inChannel = channel.getMember(botId)?.membership;
        if (inChannel !== "join" && inChannel !== "invite" && channel.canInvite(client.getSafeUserId())) {
            await client.invite(channel.roomId, botId).catch(() => undefined);
        }
    }
    if (roleIds.length > 0) {
        await client.sendStateEvent(space.roomId, MEMBER_ROLES_EVENT as never, { roles: roleIds } as never, memberRolesKey(botId));
        await syncRoles(client, space, channels);
    }
}

export async function removeBot(client: MatrixClient, space: Room, channels: Room[], botId: string): Promise<void> {
    await client.sendStateEvent(space.roomId, BOTS_EVENT as never, botsContent(readBots(space).filter((bot) => bot.userId !== botId)) as never, "");
    if (readAssignments(space).has(botId)) {
        await client.sendStateEvent(space.roomId, MEMBER_ROLES_EVENT as never, { roles: [] } as never, memberRolesKey(botId));
    }
    for (const room of [...channels, space]) {
        const membership = room.getMember(botId)?.membership;
        if (membership === "join" || membership === "invite") await client.kick(room.roomId, botId, "Removed from the server's bots").catch(() => undefined);
    }
    await syncRoles(client, space, channels);
}

export interface SaveOnboardingOptions {
    // With an enforced gate: give the member role to everyone already in the server, so they can keep talking.
    giveExistingMembersRole: boolean;
}

export async function saveOnboarding(client: MatrixClient, space: Room, channels: Room[], config: OnboardingConfig, options: SaveOnboardingOptions): Promise<void> {
    await client.sendStateEvent(space.roomId, ONBOARDING_EVENT as never, onboardingContent(config) as never, "");
    if (!config.enabled) return;
    await allowOwnState(client, space);
    if (config.gate !== "enforced" || !config.memberRoleId) return;
    const roles = readRoles(space);
    if (!roles.some((role) => role.id === config.memberRoleId)) throw new Error("The member role doesn't exist any more.");
    if (options.giveExistingMembersRole) {
        const assignments = readAssignments(space, roles);
        for (const member of space.getJoinedMembers()) {
            const current = assignments.get(member.userId) ?? [];
            if (current.includes(config.memberRoleId)) continue;
            await client.sendStateEvent(space.roomId, MEMBER_ROLES_EVENT as never, { roles: [...current, config.memberRoleId] } as never, memberRolesKey(member.userId));
        }
    }
    // Every channel: only the member role (and roles above it) may talk.
    for (const channel of channels) await setChannelTalkRole(client, space, channel, config.memberRoleId);
    await syncRoles(client, space, channels);
}

export async function saveAutomod(client: MatrixClient, space: Room, config: AutomodConfig): Promise<void> {
    await client.sendStateEvent(space.roomId, AUTOMOD_EVENT as never, automodContent(config) as never, "");
}

export async function submitOnboarding(client: MatrixClient, space: Room, response: OnboardingResponse): Promise<void> {
    await client.sendStateEvent(space.roomId, ONBOARDING_RESPONSE_EVENT as never, onboardingResponseContent(response) as never, client.getSafeUserId());
}
