// SPDX-License-Identifier: AGPL-3.0-only
// What the Meadhall bot does, done by moderators' own apps for spaces without a bot: auto-mod (remove, warn, time
// out) and giving the roles onboarding answers earn. Matrix has no rule engine on the homeserver, so someone with the
// power has to be online: whichever moderator's Meadhall sees it first acts, the others see it's done and skip.
// Limits (shown in Space Settings → Auto-mod): nothing happens while no moderator is online, and only in channels
// that moderator is in. A space that lists a bot leaves all of this to the bot.
import { EventType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { ONBOARDING_RESPONSE_EVENT, automodViolation, parseOnboardingResponse, rolesForResponse } from "../bots/botProtocol";
import { isServerBot, readAutomod, readBots, readOnboarding } from "../bots/serverBots";
import { readAssignments, readRoles, setMemberRoles } from "../roles/applyRoles";
import { MEMBER_ROLES_EVENT } from "../roles/roles";
import { applyModAction, isModerator, levelOf, logAction, readSanction, spaceChannels } from "./moderation";

// Older events (a sync catching up after being offline) are left alone, like the bot does.
const LIVE_WINDOW_MS = 60_000;
const WARNING_COOLDOWN_MS = 60_000;
// Spread out so several moderators online don't all act at once.
const MAX_DELAY_MS = 2_500;

const lastWarning = new Map<string, number>();

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Spaces (that I moderate and that have no bot) listing this room as a channel.
export function spacesActingFor(client: MatrixClient, room: Room): Room[] {
    const me = client.getSafeUserId();
    return client.getRooms().filter(
        (space) =>
            space.isSpaceRoom() &&
            space.getMyMembership() === "join" &&
            readBots(space).length === 0 &&
            isModerator(space, me) &&
            (space.roomId === room.roomId || spaceChannels(client, space).some((channel) => channel.roomId === room.roomId)),
    );
}

export async function enforceAutomod(client: MatrixClient, room: Room, event: MatrixEvent, now = Date.now()): Promise<boolean> {
    const me = client.getSafeUserId();
    const sender = event.getSender() ?? "";
    if (event.getType() !== EventType.RoomMessage || sender === me || event.isRedacted() || now - event.getTs() > LIVE_WINDOW_MS) return false;
    const space = spacesActingFor(client, room)[0];
    if (!space) return false;
    const config = readAutomod(space);
    if (!config.enabled || levelOf(space, sender) >= config.exemptRank || isServerBot(space, sender)) return false;
    if (!room.currentState.hasSufficientPowerLevelFor("redact", levelOf(room, me))) return false;
    const content = event.getContent();
    const body = typeof content.body === "string" ? content.body : "";
    const mentions = Array.isArray(content["m.mentions"]?.user_ids) ? content["m.mentions"].user_ids.length : 0;
    const reason = automodViolation(body, mentions, config);
    if (!reason) return false;

    await sleep(Math.random() * MAX_DELAY_MS);
    if (event.isRedacted()) return false; // another moderator's app got there first
    await client.redactEvent(room.roomId, event.getId()!, undefined, { reason: `Auto-mod: ${reason}` });
    if (config.action === "timeout") {
        const sanction = readSanction(space, sender);
        if (!sanction.muteUntil || sanction.muteUntil < Date.now()) {
            await applyModAction(client, space, sender, "mute", { reason: `Auto-mod: ${reason}`, durationMs: config.timeoutMinutes * 60_000 });
        }
    } else {
        await logAction(client, space, { user: sender, action: "warn", reason: `Auto-mod removed a message: ${reason}` }).catch(() => undefined);
    }
    if (config.action !== "delete") {
        const key = `${room.roomId}|${sender}`;
        if (Date.now() - (lastWarning.get(key) ?? 0) > WARNING_COOLDOWN_MS) {
            lastWarning.set(key, Date.now());
            const name = space.getMember(sender)?.name ?? sender;
            const after = config.action === "timeout" ? ` You can talk again in ${config.timeoutMinutes} minutes.` : "";
            await client.sendMessage(room.roomId, {
                msgtype: "m.notice",
                body: `${name}, your message was removed: it had ${reason}.${after}`,
                "m.mentions": { user_ids: [sender] },
            } as never);
        }
    }
    return true;
}

// Gives the roles someone's onboarding answers earn. Returns whether anything changed.
export async function grantOnboardingRoles(client: MatrixClient, space: Room, event: MatrixEvent): Promise<boolean> {
    const me = client.getSafeUserId();
    const userId = event.getStateKey() ?? "";
    if (event.getType() !== ONBOARDING_RESPONSE_EVENT || event.getSender() !== userId) return false;
    if (readBots(space).length > 0 || !isModerator(space, me)) return false;
    if (!space.currentState.maySendStateEvent(MEMBER_ROLES_EVENT, me)) return false;
    if (space.getMember(userId)?.membership !== "join") return false;
    const config = readOnboarding(space);
    if (!config.enabled) return false;
    const response = parseOnboardingResponse(event.getContent(), config);
    if (!response) return false;
    const roles = readRoles(space);
    const ownLevel = levelOf(space, me);
    const earned = rolesForResponse(config, response).filter((id) => roles.some((role) => role.id === id && role.rank < ownLevel));
    const current = readAssignments(space, roles).get(userId) ?? [];
    const next = [...new Set([...current, ...earned])];
    if (next.length === current.length) return false;
    await sleep(Math.random() * MAX_DELAY_MS);
    // Another moderator's app may have done it meanwhile.
    const now = readAssignments(space, readRoles(space)).get(userId) ?? [];
    if (earned.every((id) => now.includes(id))) return false;
    await setMemberRoles(client, space, spaceChannels(client, space), userId, [...new Set([...now, ...earned])]);
    return true;
}

// Catches up on answers sent while no moderator was online.
export async function grantPendingOnboardingRoles(client: MatrixClient, space: Room): Promise<void> {
    if (readBots(space).length > 0 || !isModerator(space, client.getSafeUserId())) return;
    for (const event of space.currentState.getStateEvents(ONBOARDING_RESPONSE_EVENT)) {
        await grantOnboardingRoles(client, space, event).catch(() => undefined);
    }
}
